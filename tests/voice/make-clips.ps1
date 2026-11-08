# Makes test voice clips with free Microsoft neural voices (edge-tts, Hindi male + female) for tests/voice/parse.mjs
# and the Telegram voice test. Needs: python -m pip install edge-tts
$dir = Join-Path $PSScriptRoot 'clips'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$phr = [ordered]@{
  'c1.mp3' = @('hi-IN-MadhurNeural', 'मारुति किराना, स्टिंग पचास क्रेट, चार सौ पचानवे')
  'c2.mp3' = @('hi-IN-SwaraNeural', 'मारुति किराना, निम्बूज़ तीस पेटी, पाँच सौ पंद्रह, यूपीआई')
  'c3.mp3' = @('hi-IN-MadhurNeural', 'श्री मारुति किराना को स्टिंग बीस केस, रेट चार सौ नब्बे, कैश')
  'c4.mp3' = @('hi-IN-SwaraNeural', 'Maruti Kirana, Sting 50 crate 495')
}
foreach ($k in $phr.Keys) { python -m edge_tts --voice $phr[$k][0] --text $phr[$k][1] --write-media (Join-Path $dir $k) 2>$null }
# 2 seconds of silence (Windows voice, no speech)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile((Join-Path $dir 'silence.wav'))
$b = New-Object System.Speech.Synthesis.PromptBuilder; $b.AppendBreak([TimeSpan]::FromSeconds(2)); $s.Speak($b); $s.Dispose()
Get-ChildItem $dir | Select-Object Name, Length
