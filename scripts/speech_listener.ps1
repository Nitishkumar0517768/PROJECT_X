[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$recognizer.SetInputToDefaultAudioDevice()

# Load specific command grammar for better accuracy
$commands = New-Object System.Speech.Recognition.Choices
$commands.Add(@(
    "where am I",
    "find bugs",
    "what is wrong",
    "fix it",
    "fix this",
    "confirm",
    "yes",
    "apply it",
    "reject",
    "no",
    "cancel",
    "repeat that",
    "say again",
    "stop talking",
    "stop",
    "slower",
    "faster",
    "spell it out",
    "drop a landmark",
    "drop landmark",
    "list landmarks",
    "toggle audio",
    "create checkpoint",
    "save checkpoint",
    "undo",
    "go back",
    "restore",
    "take me to",
    "go to",
    "what does this do",
    "explain this",
    "tell me about this project"
))
$commandGrammar = New-Object System.Speech.Recognition.GrammarBuilder($commands)
$grammar = New-Object System.Speech.Recognition.Grammar($commandGrammar)
$grammar.Name = "commands"
$recognizer.LoadGrammar($grammar)

# Also load dictation grammar for free-form speech
$dictation = New-Object System.Speech.Recognition.DictationGrammar
$dictation.Name = "dictation"
$recognizer.LoadGrammar($dictation)

# Use Register-ObjectEvent so output reaches stdout properly
Register-ObjectEvent -InputObject $recognizer -EventName SpeechDetected -Action {
    Write-Host "HEARING"
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognized -Action {
    $r = $EventArgs.Result
    if ($r.Grammar.Name -eq "commands" -and $r.Confidence -gt 0.85) {
        $conf = [math]::Round($r.Confidence * 100)
        Write-Host "RECOGNIZED:$($r.Text):$conf"
    } elseif ($r.Audio) {
        $memStream = New-Object System.IO.MemoryStream
        $r.Audio.WriteToWaveStream($memStream)
        $bytes = $memStream.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        Write-Host "AUDIO:$base64"
    }
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognitionRejected -Action {
    $r = $EventArgs.Result
    if ($r -and $r.Audio) {
        $memStream = New-Object System.IO.MemoryStream
        $r.Audio.WriteToWaveStream($memStream)
        $bytes = $memStream.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        Write-Host "AUDIO:$base64"
    }
} | Out-Null

Write-Host "READY"

try {
    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
    while ($true) { Start-Sleep -Milliseconds 200 }
} catch {
    Write-Host "ERROR:$($_.Exception.Message)"
}
