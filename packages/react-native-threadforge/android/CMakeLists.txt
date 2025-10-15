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