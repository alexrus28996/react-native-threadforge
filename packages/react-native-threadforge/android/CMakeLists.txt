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

target_link_libraries(
    react-native-threadforge
    ${LOG_LIB}
    android
    fbjni::fbjni
    ReactAndroid::jsi
    ReactAndroid::hermes_executor
)