' Starts the Workstation Meva server silently (no console window).
' Calls start-server.ps1 directly (the .bat files are repaired by it,
' so even a broken Start Server.bat cannot break the autostart).
' Run with "-open" to also open the app in the default browser when ready.
' Run with no arguments (scheduled autostart) to start silently without a browser.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count > 0 Then
  mode = " open"
Else
  mode = " hidden"
End If
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\start-server.ps1"" -Mode" & mode, 0, False
