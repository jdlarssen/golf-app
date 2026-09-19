Pod::Spec.new do |s|
  s.name           = 'NoUrlCache'
  s.version        = '1.0.0'
  s.summary        = 'Turns off the shared iOS URL cache at launch.'
  s.description    = 'Local Expo module (#1973): no HTTP response body from Supabase or /api reaches the disk, and leftovers from older builds are purged on first launch.'
  s.author         = 'Tørny'
  s.homepage       = 'https://tornygolf.no'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
