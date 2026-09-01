; Workstation Meva Online - Windows Installer
; NSIS Script - compiles with makensis.exe (NSIS 3.x)
;
; Produces: installer/workstation-meva-setup.exe
;
; Usage:
;   1. Build the app first:  cd frontend && npm run build && cd ..\backend && npm run build
;   2. Compile:  "C:\Program Files (x86)\NSIS\Bin\makensis.exe" installer\workstation-meva-setup.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; ---------------------------------------------------------------------------
; Configuration
; ---------------------------------------------------------------------------
Name "Workstation Meva Online"
OutFile "workstation-meva-setup.exe"
InstallDir "C:\Workstation-Meva"
InstallDirRegKey HKLM "Software\WorkstationMeva" "InstallDir"
RequestExecutionLevel admin
Unicode True

; Version info shown in Explorer properties
VIProductVersion "1.0.0.2"
VIAddVersionKey "ProductName" "Workstation Meva Online"
VIAddVersionKey "ProductVersion" "1.0.0-beta.1"
VIAddVersionKey "FileVersion" "1.0.0-beta.1"
VIAddVersionKey "FileDescription" "Workstation Meva Online Installer (Beta)"
VIAddVersionKey "LegalCopyright" "Free & public domain (Unlicense)"

; ---------------------------------------------------------------------------
; Modern UI configuration
; ---------------------------------------------------------------------------
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_WELCOMEPAGE_TITLE "Workstation Meva Online Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install Workstation Meva Online on your computer.$\r$\n$\r$\nINSTALLER NOTES:$\r$\n  - BETA release (v1.0.0-beta.1) - testing mode$\r$\n  - Free & open source - public domain (Unlicense)$\r$\n  - Always installs a FRESH copy: NO user data, NO database, NO previous settings$\r$\n$\r$\nThe installer will:$\r$\n  - Copy the application files$\r$\n  - Open port 3002 in the Windows Firewall$\r$\n  - Create Start Menu shortcuts$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\windows\Control Panel.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Open the Control Panel (set up your database)"
!define MUI_FINISHPAGE_LINK "Open documentation"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/kuldeep7ke/workstationmeva-setup"

; ---------------------------------------------------------------------------
; Terms & Conditions acceptance
; ---------------------------------------------------------------------------
; Default off. Next is blocked until the user ticks the box.
Var TermsDialog
Var TermsAgreedChk
Var TermsResult

; ---------------------------------------------------------------------------
; Maintenance-mode state (Reinstall / Uninstall when already installed)
; ---------------------------------------------------------------------------
Var MaintDialog
Var RadioReinstall
Var RadioUninstall

; ---------------------------------------------------------------------------
; Uninstaller user-data choice (Keep data vs Clean all)
; ---------------------------------------------------------------------------
Var UnDataDlg
Var UnRadioKeep
Var UnRadioClean
Var UnKeepData  ; 1 = keep user data, 0 = remove everything

; ---------------------------------------------------------------------------
; Pages
; ---------------------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
Page custom TermsPageCreate TermsPageLeave
Page custom MaintenancePageCreate MaintenancePageLeave
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipDirectoryOnMaint
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller: ask what to remove, then confirm, then show progress.
UninstPage custom un.unDataPageCreate un.unDataPageLeave
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------------------
; Terms & Conditions page (accept before installing)
; ---------------------------------------------------------------------------
Function TermsPageCreate
  !insertmacro MUI_HEADER_TEXT "Workstation Meva Online - Terms and Conditions" "Please read and accept the terms before continuing"
  nsDialogs::Create 1018
  Pop $TermsDialog
  ${If} $TermsDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 100u "Workstation Meva Online is free and open-source software (Unlicense / public domain).$\r$\n$\r$\nInstalling this application copies files to your computer, opens TCP port 3002 in the Windows Firewall, adds Start Menu and desktop shortcuts, and installs small helper utilities.$\r$\n$\r$\nYour ONLINE data is stored in your own Supabase project. Local files (workstation.db, backups, telemetry, logs, .env) stay on THIS computer - uninstalling can keep or permanently delete them (you choose at uninstall time).$\r$\n$\r$\nThe software is provided AS IS, WITHOUT warranty of any kind. Use it at your own risk.$\r$\n$\r$\nFull legal text: see the LICENSE file included with the source code."
  Pop $0
  ${NSD_CreateCheckBox} 12u 108u 80% 14u "I &accept the Terms and Conditions"
  Pop $TermsAgreedChk
  nsDialogs::Show
FunctionEnd

Function TermsPageLeave
  ${NSD_GetState} $TermsAgreedChk $TermsResult
  ${If} $TermsResult = ${BST_UNCHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Please tick I have read and accept the Terms and Conditions to continue." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; Maintenance-mode functions (skip page + uninstall on fresh installs)
; ---------------------------------------------------------------------------
; Show the Reinstall/Uninstall page ONLY when an installation already
; exists ($INSTDIR contains app.installed and Uninstall.exe).
Function MaintenancePageCreate
  ${IfNot} ${FileExists} "$INSTDIR\app.installed"
    Abort
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\Uninstall.exe"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Workstation Meva Online Maintenance" "Reinstall/repair or uninstall the installation"
  nsDialogs::Create 1018
  Pop $MaintDialog
  ${If} $MaintDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Welcome to the Workstation Meva Online Setup maintenance.$\r$\nSelect one of the following options:"
  Pop $0
  ${NSD_CreateRadioButton} 12u 36u 88% 12u "&Reinstall / Repair - refresh ALL application files, shortcuts and firewall rule (your data in this folder is kept)"
  Pop $RadioReinstall
  ${NSD_Check} $RadioReinstall
  ${NSD_CreateRadioButton} 12u 54u 88% 12u "&Uninstall - remove Workstation Meva Online from this computer"
  Pop $RadioUninstall
  nsDialogs::Show
FunctionEnd

Function MaintenancePageLeave
  ${NSD_GetState} $RadioUninstall $0
  ${If} $0 = ${BST_CHECKED}
    ; Uninstall selected: launch the separate uninstaller with a VISIBLE window and
    ; WAIT for it to finish. CRITICAL: do NOT pass " _?=$INSTDIR" (in-place mode) -
    ; that disables NSIS self-deletion, which is exactly what left Uninstall.exe and
    ; the install folder behind. Run without it so the uninstaller copies itself to
    ; %TEMP%, can delete Uninstall.exe, and can remove the install folder.
    ; ExecWait (not Exec) keeps setup visible until the uninstaller completes and
    ; avoids the "Exec then Quit" race that silently failed to spawn the child.
    ExecWait '"$INSTDIR\Uninstall.exe"'
    Quit
  ${EndIf}
  ; Reinstall / Repair falls through to the normal install below.
FunctionEnd

; When a previous installation exists, reuse its folder - skip the chooser.
Function SkipDirectoryOnMaint
  ${If} ${FileExists} "$INSTDIR\app.installed"
    Abort
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; Installer sections
; ---------------------------------------------------------------------------

Section "Install" SecMain
  ; Ensure Autostart is OFF by default for fresh installs (user must enable
  ; explicitly via Install Autostart.bat or Control Panel). If a stale
  ; Startup lnk was left by an old uninstall that didn't clean it, remove
  ; it now. For Reinstall/Repair (app.installed already exists), preserve
  ; the user's previous choice - don't touch.
  ${IfNot} ${FileExists} "$INSTDIR\app.installed"
    Delete "$SMSTARTUP\Workstation Meva.lnk"
    SetShellVarContext all
    Delete "$SMSTARTUP\Workstation Meva.lnk"
    SetShellVarContext current
    nsExec::Exec 'cmd /c del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk" 2>nul'
    nsExec::Exec 'cmd /c del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk" 2>nul'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Workstation Meva"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Workstation Meva"
  ${EndIf}

  SetOutPath "$INSTDIR"

  ; --- Copy application files ---

  ; Frontend (built dist)
  SetOutPath "$INSTDIR\frontend\dist"
  File /r /x "*.map" "..\frontend\dist\*.*"

  ; Backend (built dist)
  SetOutPath "$INSTDIR\backend\dist"
  ; FRESH-INSTALL GUARANTEE: explicitly exclude any user/`server state data
  ; patterns so the installer ships code only - never user data.
  File /r /x "*.db" /x "*.db-*" /x "*.sqlite*" /x ".env" /x ".env.*" /x "*.log" /x "backups" /x "telemetry" /x "saved-connections.json" "..\backend\dist\*.*"

  ; Backend dependencies (pre-installed node_modules)
  SetOutPath "$INSTDIR\backend\node_modules"
  File /r /x ".package-lock.json" /x "*.md" /x "*.txt" /x "*.d.ts" /x "*.flow" "..\backend\node_modules\*.*"

  ; Backend env template
  SetOutPath "$INSTDIR\backend"
  File "..\backend\.env.example"

  ; --- Bundled Node.js runtime (portable) ---
  SetOutPath "$INSTDIR\node"
  File /r "..\tools\node\node-v24.19.0-win-x64\*.*"

  ; --- Caddy reverse proxy ---
  SetOutPath "$INSTDIR\proxy\caddy"
  File /nonfatal "..\proxy\caddy\caddy.exe"
  File /nonfatal "..\proxy\caddy\Caddyfile"

  ; --- LAN helpers ---
  SetOutPath "$INSTDIR\lan"
  File /nonfatal "..\lan\Add Workstation Hosts.bat"
  File /nonfatal "..\lan\Add Workstation Hosts.command"

; --- Launcher scripts + Control Panel ---
  SetOutPath "$INSTDIR\windows"
  File "..\windows\Start Server.bat"
  File "..\windows\Start Server Hidden.vbs"
  File "..\windows\Stop Server.bat"
  File "..\windows\start-server.ps1"
  File "..\windows\start-server-core.ps1"
  File "..\windows\Install Autostart.bat"
  File "..\windows\Remove Autostart.bat"
  File "..\windows\Repair Launcher.bat"
  File "..\windows\Clean Junk.bat"
  File "..\windows\firewall-heal.bat"
  File "..\windows\Control Panel.bat"
  File "..\windows\Control Panel.ps1"
  File "..\windows\db-probe.js"
  File "..\windows\stop-app.ps1"

  ; --- Save install path for uninstaller ---
  WriteRegStr HKLM "Software\WorkstationMeva" "InstallDir" "$INSTDIR"

  ; --- Mark this as a packaged (installer) layout ---
  ; Tells the launcher this is a pre-built install: it must NOT run npm
  ; install/build on first start (frontend/node_modules is not bundled and
  ; the machine may be offline). Without this, Start would fail after Caddy
  ; fired up - the "caddy runs but server never starts" bug.
  FileOpen $0 "$INSTDIR\app.installed" w
  FileWrite $0 "Workstation Meva packaged layout - pre-built, skip npm install/build."
  FileClose $0

  ; .env is auto-created by the launcher on first run (random JWT_SECRET)

  ; --- Open port 3002 in Windows Firewall (delete first so Modify/Repair can re-add) ---
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Workstation Meva 3002"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Workstation Meva 3002" protocol=TCP dir=in localport=3002 action=allow profile=any'

  ; --- Start Menu shortcuts ---
  CreateDirectory "$SMPROGRAMS\Workstation Meva"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Start Server.lnk" "$INSTDIR\windows\Start Server.bat" "" "" "" SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Start Server (Hidden).lnk" "$INSTDIR\windows\Start Server Hidden.vbs"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Control Panel.lnk" "$INSTDIR\windows\Control Panel.bat"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Stop Server.lnk" "$INSTDIR\windows\Stop Server.bat"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Install Autostart.lnk" "$INSTDIR\windows\Install Autostart.bat"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Remove Autostart.lnk" "$INSTDIR\windows\Remove Autostart.bat"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Workstation Meva Website.lnk" "http://localhost:3002"
  CreateShortcut "$SMPROGRAMS\Workstation Meva\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; --- Desktop shortcut ---
  CreateShortcut "$DESKTOP\Workstation Meva.lnk" "$INSTDIR\windows\Start Server.bat" "" "" "" SW_SHOWMINIMIZED
  CreateShortcut "$DESKTOP\Workstation Meva Control Panel.lnk" "$INSTDIR\windows\Control Panel.bat"

  ; --- Uninstaller ---
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; --- Size estimate ---
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "EstimatedSize" "$0"

  ; --- Add/Remove Programs entry ---
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "DisplayName" "Workstation Meva Online"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "DisplayIcon" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "Publisher" "kuldeep7ke"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "URLInfoAbout" "https://github.com/kuldeep7ke/workstationmeva-setup"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva" "NoRepair" 1

  ; The Finish page's "Open the Control Panel (set up your database)" checkbox
  ; (MUI_FINISHPAGE_RUN) runs only when the user clicks Finish - we do NOT
  ; auto-open the browser here, because the server may not be started yet.

SectionEnd

; ---------------------------------------------------------------------------
; Uninstaller
; ---------------------------------------------------------------------------

; Ask the user what to remove: keep local user data, or clean everything.
Function un.unDataPageCreate
  !insertmacro MUI_HEADER_TEXT "Workstation Meva Online Uninstall" "Choose whether to keep your data"
  nsDialogs::Create 1018
  Pop $UnDataDlg
  ${If} $UnDataDlg == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 26u "What should be removed from this computer?$\r$\nYour ONLINE data stays safe in your Supabase database either way.$\r$\nThese choices only affect files stored locally in $INSTDIR."
  Pop $0
  ${NSD_CreateRadioButton} 12u 40u 88% 22u "&Keep user data - remove the program but keep my data$\r$\n  (workstation.db, backups, telemetry, server.log, backend\.env)"
  Pop $UnRadioKeep
  ${NSD_Check} $UnRadioKeep
  ${NSD_CreateRadioButton} 12u 70u 88% 22u "Remove &ALL data - clean the entire install folder$\r$\n  ($INSTDIR, including all local databases, logs and settings)"
  Pop $UnRadioClean
  nsDialogs::Show
FunctionEnd

Function un.unDataPageLeave
  ${NSD_GetState} $UnRadioClean $0
  ${If} $0 = ${BST_CHECKED}
    StrCpy $UnKeepData 0
  ${Else}
    StrCpy $UnKeepData 1
  ${EndIf}
FunctionEnd

Section "Uninstall"

  ; Stop server + Caddy if running
  ; Targeted kill: only processes belonging to THIS install (see stop-app.ps1).
  ; Do NOT use "taskkill /f /im node.exe" - that kills every Node app on the
  ; machine, unrelated to this install.
  ; If stop-app.ps1 is missing (e.g. partial install or already-removed
  ; windows\ folder), fall back to a minimal targeted kill so the details
  ; log does not show "does not exist" / PowerShell banner noise.
  ${If} ${FileExists} "$INSTDIR\windows\stop-app.ps1"
    nsExec::ExecToLog 'powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -File "$INSTDIR\windows\stop-app.ps1" "$INSTDIR"'
  ${Else}
    nsExec::ExecToLog 'powershell -NoProfile -NoLogo -Command "Get-NetTCPConnection -LocalPort 3002 -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $$_.OwningProcess -Force -EA SilentlyContinue }"'
  ${EndIf}
  Sleep 2000

  ; Remove firewall rule (silent - no "No rules match..." noise when
  ; the rule was already removed or never created)
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Workstation Meva 3002"'

  ; Remove Autostart entry (Startup folder) - otherwise next OS boot tries
  ; to launch wscript.exe "C:\Workstation-Meva\windows\Start Server Hidden.vbs"
  ; which no longer exists and shows an error. Autostart was created by
  ; windows\Install Autostart.bat or Control Panel -> Toggle-Autostart
  ; (same Startup .lnk). Do this BEFORE deleting the install folder so a
  ; dangling .lnk never remains. We cover all variants:
  ;  1) Try the official Remove Autostart.bat logic (silent, no pause)
  ;  2) NSIS Delete for current user + All Users Startup (covers admin context)
  ;  3) cmd del for %APPDATA% / %ProgramData%
  ;  4) sweep C:\Users\*\AppData\... for any other user that enabled it
  ;  5) registry Run + scheduled task (future-proof, no-ops if absent)
  ${If} ${FileExists} "$INSTDIR\windows\Remove Autostart.bat"
    ; Remove Autostart.bat is just: del "%APPDATA%\...\Startup\Workstation Meva.lnk"
    ; but it ends with `pause` which would hang the uninstaller, so we
    ; replicate its `del` directly instead of Exec-ing the .bat.
    ; Keep the intent: "remove by Remove Autostart.bat".
    nsExec::Exec 'cmd /c del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk" 2>nul'
  ${EndIf}
  Delete "$SMSTARTUP\Workstation Meva.lnk"
  SetShellVarContext all
  Delete "$SMSTARTUP\Workstation Meva.lnk"
  SetShellVarContext current
  nsExec::Exec 'cmd /c del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk" 2>nul'
  nsExec::Exec 'cmd /c del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk" 2>nul'
  nsExec::Exec 'powershell -NoProfile -NoLogo -Command "Get-ChildItem ''C:\Users'' -Directory -EA SilentlyContinue | ForEach-Object { Remove-Item -Path (Join-Path $$_.FullName ''AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk'') -Force -EA SilentlyContinue }"'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Workstation Meva"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Workstation Meva"
  nsExec::Exec 'schtasks /Delete /TN "Workstation Meva" /F 2>nul'
  nsExec::Exec 'schtasks /Delete /TN "WorkstationMeva" /F 2>nul'

  ; Remove Start Menu shortcuts
  RMDir /r "$SMPROGRAMS\Workstation Meva"

  ; Remove desktop shortcut
  Delete "$DESKTOP\Workstation Meva.lnk"
  Delete "$DESKTOP\Workstation Meva Control Panel.lnk"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkstationMeva"
  DeleteRegKey HKLM "Software\WorkstationMeva"

  ${If} $UnKeepData = 1
    ; ---- KEEP USER DATA ------------------------------------------------
    ; Remove the program itself but leave local user data behind:
    ;   backend\workstation.db, backend\backups\, telemetry\, server.log,
    ;   backend\.env  (plus the install folder with those files remaining).
    RMDir /r "$INSTDIR\frontend"
    RMDir /r "$INSTDIR\node"
    RMDir /r "$INSTDIR\proxy"
    RMDir /r "$INSTDIR\lan"
    RMDir /r "$INSTDIR\windows"
    RMDir /r "$INSTDIR\backend\dist"
    RMDir /r "$INSTDIR\backend\node_modules"
    RMDir /r "$INSTDIR\backend\src"
    RMDir /r "$INSTDIR\backend\tools"
    Delete "$INSTDIR\backend\.env.example"
    Delete "$INSTDIR\backend\package.json"
    Delete "$INSTDIR\backend\package-lock.json"
    Delete "$INSTDIR\backend\tsconfig.json"
    Delete "$INSTDIR\backend\tsconfig.build.json"
    Delete "$INSTDIR\app.installed"
  ${Else}
    ; ---- CLEAN ALL -----------------------------------------------------
    ; Remove the ENTIRE install folder, including Uninstall.exe, then retry a
    ; few times in case a process is still releasing a file handle. RMDir on a
    ; missing folder is a harmless no-op, so the loop stops on its own.
    StrCpy $0 0
  clean_retry:
    RMDir /r "$INSTDIR"
    Sleep 300
    IntOp $0 $0 + 1
    IntCmp $0 12 clean_done clean_done clean_retry
  clean_done:
  ${EndIf}

  ; Remove Uninstall.exe itself. Safe because this uninstaller runs from a
  ; %TEMP% copy (we never launch with the in-place "_?=" flag).
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

SectionEnd
