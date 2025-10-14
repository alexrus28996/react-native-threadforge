cmake_minimum_required(VERSION 3.13)
project(react-native-threadforge)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_VERBOSE_MAKEFILE ON)

# Exact C++ source files (NO GLOB!)
add_library(
    react-native-threadforge
    SHARED
    ../cpp/ThreadPool.cpp
    src/main/cpp/ThreadForgeJNI.cpp
)

# Include directories
target_include_directories(
    react-native-threadforge
    PRIVATE
    ../cpp
)

# Find and link libraries
find_library(LOG_LIB log)

target_link_libraries(
    react-native-threadforge
    ${LOG_LIB}
    android
)