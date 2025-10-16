# Author: Abhishek Kumar <alexrus28996@gmail.com>
require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = package["name"]
  s.version      = package["version"]
  s.summary      = package["description"] || "ThreadForge iOS module"
  s.description  = package["description"] || s.summary
  s.homepage     = "https://github.com/alexrus28996/react-native-threadforge"
  s.license      = { :type => package["license"] || "MIT" }
  s.author       = package["author"] || "ThreadForge"
  s.platform     = :ios, "12.0"
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"
  s.public_header_files = "ios/**/*.h"
  s.requires_arc = true
  s.dependency "React-Core"
  s.compiler_flags = "-std=c++17"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++",
    "HEADER_SEARCH_PATHS" => '$(PODS_TARGET_SRCROOT)/cpp'
  }
  s.user_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++"
  }
  s.libraries = "c++"
end
