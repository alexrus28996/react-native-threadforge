# frozen_string_literal: true

# CocoaPods prior to 1.13.0 does not define the `visionos` DSL helper that
# newer React Native podspecs expect. Attempting to evaluate those podspecs
# raises a `NoMethodError`, which prevents `pod install` from completing.
#
# To keep the project compatible with older environments (such as CI machines
# that have not yet upgraded CocoaPods), we provide a lightweight shim that
# proxies `visionos` configuration to the existing iOS platform definition.
#
# This mirrors the structure of the existing DSL methods well enough for the
# Hermes podspec to evaluate while still encouraging developers to upgrade to
# a newer CocoaPods release when possible.

return if Pod::Specification.instance_methods.include?(:visionos)

module Pod
  class Specification
    # Expose a `visionos` DSL helper for older CocoaPods releases. The Hermes
    # podspec uses this helper to configure vendored frameworks. We map the
    # call to the iOS proxy so CocoaPods can continue resolving dependencies
    # without understanding the new platform.
    def visionos
      Pod::UI.warn('CocoaPods 1.13+ is recommended for visionOS support. Falling back to iOS configuration for compatibility.')
      ios
    end
  end
end
