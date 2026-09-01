@echo off
REM Elevated helper: adds/repairs the Workstation Meva inbound firewall rule.
REM Called from start-server.ps1 when the rule is missing. Covers ALL network
REM profiles (Domain/Private/Public) so LAN access keeps working even if
REM Windows reclassifies the network type.
netsh advfirewall firewall add rule name="Workstation Meva 3002" dir=in action=allow protocol=TCP localport=3002 profile=any
netsh advfirewall firewall show rule name="Workstation Meva 3002"
