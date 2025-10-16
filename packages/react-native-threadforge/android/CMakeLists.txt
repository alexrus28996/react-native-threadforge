cmake_minimum_required(VERSION 3.13)
project(react-native-threadforge)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_VERBOSE_MAKEFILE ON)

# Exact C++ source files (NO GLOB!)
add_library(
    react-native-threadforge
    SHARED
    ../cpp/FunctionExecutor.cpp
    ../cpp/TaskResult.cpp
    ../cpp/ThreadPool.cpp
    cpp/ThreadForgeJNI.cpp
)

# Include directories
target_include_directories(
    react-native-threadforge
    PRIVATE
    ../cpp
)

# Find and link libraries
find_library(LOG_LIB log)

if(NOT DEFINED REACT_ANDROID_DIR)
    message(FATAL_ERROR "REACT_ANDROID_DIR is not defined. Make sure the Gradle build passes -DREACT_ANDROID_DIR to CMake.")
endif()

file(TO_CMAKE_PATH "${REACT_ANDROID_DIR}" REACT_ANDROID_DIR_CMAKE)

set(_reactandroid_search_paths
    "${REACT_ANDROID_DIR_CMAKE}"
    "${REACT_ANDROID_DIR_CMAKE}/build"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/release"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/debug"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/prefab"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/release/prefab"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/debug/prefab"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/release/prefab/modules"
    "${REACT_ANDROID_DIR_CMAKE}/build/react-android/debug/prefab/modules"
)

if(DEFINED PROJECT_BUILD_DIR)
    file(TO_CMAKE_PATH "${PROJECT_BUILD_DIR}" PROJECT_BUILD_DIR_CMAKE)
    list(APPEND _reactandroid_search_paths
        "${PROJECT_BUILD_DIR_CMAKE}"
        "${PROJECT_BUILD_DIR_CMAKE}/prefab"
        "${PROJECT_BUILD_DIR_CMAKE}/prefab/modules"
    )
endif()

foreach(path ${_reactandroid_search_paths})
    if (EXISTS "${path}/ReactAndroidConfig.cmake")
        set(ReactAndroid_DIR "${path}")
    endif()
    if (EXISTS "${path}/fbjniConfig.cmake")
        set(fbjni_DIR "${path}")
    endif()
    list(APPEND CMAKE_PREFIX_PATH "${path}")
endforeach()

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

# Hermes is optional when using an alternative JS engine, but when the
# hermes-engine prefab is present (the default for React Native Android
# apps) we need to link against it to satisfy symbols such as
# facebook::hermes::makeHermesRuntime().  On some build setups the
# ReactAndroid CMake exports do not create a convenience target like
# ReactAndroid::hermes_executor, so we look up hermes-engine directly to
# ensure the shared library is available during linking.
find_package(hermes-engine QUIET CONFIG)

set(_threadforge_deps
    ${LOG_LIB}
    android
    fbjni::fbjni
    ReactAndroid::jsi
)

set(_hermes_target_found OFF)

foreach(_hermes_candidate IN ITEMS
    ReactAndroid::hermes_executor
    hermes_executor
    hermes-engine::libhermes
    hermes::libhermes
    hermes::hermes
)
    if (TARGET ${_hermes_candidate})
        list(APPEND _threadforge_deps ${_hermes_candidate})
        set(_hermes_target_found ON)
    endif()
endforeach()

if (NOT _hermes_target_found)
    # Some build setups (particularly on Windows) do not expose a
    # convenience CMake target for Hermes even though the prefab package is
    # available. In that case, fall back to resolving the shared library
    # directly so that symbols such as facebook::hermes::makeHermesRuntime()
    # are satisfied at link time.
    set(_hermes_library_paths)
    if (DEFINED ANDROID_ABI)
        set(_hermes_android_abi "${ANDROID_ABI}")
    elseif(DEFINED CMAKE_ANDROID_ARCH_ABI)
        set(_hermes_android_abi "${CMAKE_ANDROID_ARCH_ABI}")
    endif()

    if (DEFINED _hermes_android_abi)
        set(_hermes_prefab_suffixes
            "prefab/modules/hermes/libs/${_hermes_android_abi}"
            "prefab/modules/hermes/libs/android.${_hermes_android_abi}"
        )
    else()
        set(_hermes_prefab_suffixes "prefab/modules/hermes/libs")
    endif()

    foreach(_base_path ${_reactandroid_search_paths})
        foreach(_suffix ${_hermes_prefab_suffixes})
            list(APPEND _hermes_library_paths "${_base_path}/${_suffix}")
        endforeach()
    endforeach()

    find_library(
        HERMES_LIB
        NAMES hermes libhermes
        PATHS ${_hermes_library_paths}
        NO_DEFAULT_PATH
    )

    if (HERMES_LIB)
        list(APPEND _threadforge_deps ${HERMES_LIB})
        set(_hermes_target_found ON)
    endif()
endif()

if (NOT _hermes_target_found)
    message(WARNING "Hermes library not found. ThreadForge requires Hermes on Android to execute background tasks.")
endif()

target_link_libraries(
    react-native-threadforge
    ${_threadforge_deps}
)