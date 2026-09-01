# Workstation Meva - Control Panel (Windows)
# ==================================================
# A small native panel to manage the machine-level parts of the app:
#   - Server start / stop / health / open app
#   - Autostart at login  (Startup-folder shortcut, same as Install/Remove Autostart.bat)
#   - Caddy proxy status / toggle  (port 80, LAN access)
#   - Supabase database URL  (reads/writes backend\.env DATABASE_URL, live ping via db-probe.js)
#   - LAN addresses + copy buttons
#   - Tools: repair launcher, heal firewall, clean junk, view server.log, open backend folder
#   - Settings: open browser after start, port read from .env
#
# Launched by "windows\Control Panel.bat" (double-click / Start Menu / desktop).
# Reuses the SAME state files as the existing .bat launchers - nothing is duplicated.

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml

$root     = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$winDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend  = Join-Path $root 'backend'
$envFile  = Join-Path $backend '.env'
$logFile  = Join-Path $root 'server.log'
$startupLnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\Workstation Meva.lnk'

$nodeExe = Join-Path $root 'node\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { $nodeExe = 'node' }
$probe   = Join-Path $winDir 'db-probe.js'

$script:cfg = @{ PORT = 3002; DATABASE_URL = '' }
$script:dbJob = $null
$script:dbBusy = $false
$script:dbLast = (Get-Date).AddMinutes(-10)
$script:dbText = 'Unknown'

# ---------------------------------------------------------------------------
# XAML
# ---------------------------------------------------------------------------
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Workstation Meva Control Panel"
        Width="640" MinWidth="600" MinHeight="720" SizeToContent="Height"
        Background="#0F172A" WindowStartupLocation="CenterScreen" FontFamily="Segoe UI">
  <ScrollViewer VerticalScrollBarVisibility="Auto">
  <StackPanel Margin="14,12,14,14">

    <!-- Header -->
    <StackPanel Margin="2,0,2,10">
      <DockPanel>
        <StackPanel DockPanel.Dock="Left">
          <TextBlock Text="Workstation Meva" FontSize="22" FontWeight="Bold" Foreground="#F8FAFC"/>
          <TextBlock Text="Control Panel" FontSize="12" Foreground="#94A3B8" Margin="0,2,0,0"/>
        </StackPanel>
        <StackPanel DockPanel.Dock="Right" HorizontalAlignment="Right" VerticalAlignment="Top">
          <TextBlock x:Name="txtVersion" FontSize="11" Foreground="#94A3B8" HorizontalAlignment="Right"/>
          <TextBlock Text="Free &amp; public domain (Unlicense)" FontSize="10" Foreground="#64748B" HorizontalAlignment="Right" VerticalAlignment="Bottom"/>
        </StackPanel>
      </DockPanel>
    </StackPanel>

    <!-- First-run database banner -->
    <Border x:Name="banner" CornerRadius="8" Background="#332B04" BorderBrush="#F59E0B"
            BorderThickness="1" Margin="2,0,2,10" Padding="12" Visibility="Collapsed">
      <StackPanel>
        <TextBlock x:Name="bannerTitle" Text="Set up your database first" FontWeight="Bold" Foreground="#FBBF24" FontSize="13"/>
        <TextBlock x:Name="bannerText" TextWrapping="Wrap" Foreground="#FDE68A" FontSize="11" Margin="0,4,0,6"
                   Text="The app needs a free Supabase PostgreSQL database. Paste your connection string into the Database card below and click Save, or follow the guide."/>
        <Button x:Name="lnkDbGuide" Content="Open the Supabase setup guide" Background="Transparent"
                BorderThickness="0" Foreground="#60A5FA" HorizontalAlignment="Left" Cursor="Hand" FontSize="11"/>
      </StackPanel>
    </Border>

    <!-- Card grid helper rows -->
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="*"/>
        <ColumnDefinition Width="*"/>
      </Grid.ColumnDefinitions>

      <!-- Server card -->
      <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="2,0,4,8">
        <StackPanel>
          <StackPanel Orientation="Horizontal">
            <Ellipse x:Name="dotSrv" Width="10" Height="10" Fill="#F87171" VerticalAlignment="Center"/>
            <TextBlock Text="Server" FontWeight="Bold" Foreground="#E2E8F0" Margin="8,0,0,0"/>
            <TextBlock x:Name="txtSrvState" Text="Stopped" FontSize="12" Foreground="#F87171" Margin="8,0,0,0" VerticalAlignment="Center"/>
          </StackPanel>
          <TextBlock x:Name="txtSrvDetail" TextWrapping="Wrap" Foreground="#94A3B8" FontSize="11" Margin="18,6,0,0"/>
          <StackPanel Orientation="Horizontal" Margin="0,10,0,0">
            <Button x:Name="btnSrvStart" Content="Start" Padding="10,4" Margin="0,0,6,0" FontSize="11"/>
            <Button x:Name="btnSrvStop" Content="Stop" Padding="10,4" Margin="0,0,6,0" FontSize="11"/>
            <Button x:Name="btnOpenApp" Content="Open app" Padding="10,4" FontSize="11"/>
          </StackPanel>
        </StackPanel>
      </Border>

      <!-- Autostart card -->
      <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="4,0,2,8" Grid.Column="1">
        <StackPanel>
          <StackPanel Orientation="Horizontal">
            <Ellipse x:Name="dotAst" Width="10" Height="10" Fill="#F87171" VerticalAlignment="Center"/>
            <TextBlock Text="Autostart at login" FontWeight="Bold" Foreground="#E2E8F0" Margin="8,0,0,0"/>
            <TextBlock x:Name="txtAstState" Text="Off" FontSize="12" Foreground="#F87171" Margin="8,0,0,0" VerticalAlignment="Center"/>
          </StackPanel>
          <TextBlock TextWrapping="Wrap" Foreground="#94A3B8" FontSize="11" Margin="18,6,0,0"
                     Text="Starts the server silently in the background at every Windows login."/>
          <Button x:Name="btnAstToggle" Content="Enable autostart" Padding="10,4" Margin="18,10,0,0"
                  HorizontalAlignment="Left" FontSize="11"/>
        </StackPanel>
      </Border>
    </Grid>

    <!-- Proxy + status line -->
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="*"/>
        <ColumnDefinition Width="*"/>
      </Grid.ColumnDefinitions>

      <!-- Proxy card -->
      <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="2,0,4,8">
        <StackPanel>
          <StackPanel Orientation="Horizontal">
            <Ellipse x:Name="dotPx" Width="10" Height="10" Fill="#F87171" VerticalAlignment="Center"/>
            <TextBlock Text="Proxy (Caddy)" FontWeight="Bold" Foreground="#E2E8F0" Margin="8,0,0,0"/>
            <TextBlock x:Name="txtPxState" Text="Stopped" FontSize="12" Foreground="#F87171" Margin="8,0,0,0" VerticalAlignment="Center"/>
          </StackPanel>
          <TextBlock x:Name="txtPxDetail" TextWrapping="Wrap" Foreground="#94A3B8" FontSize="11" Margin="18,6,0,0"/>
          <Button x:Name="btnPxToggle" Content="Start proxy" Padding="10,4" Margin="18,10,0,0"
                  HorizontalAlignment="Left" FontSize="11"/>
        </StackPanel>
      </Border>

      <!-- Bookmarks rows reused for LAN quick links -->
      <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="4,0,2,8" Grid.Column="1">
        <StackPanel>
          <StackPanel Orientation="Horizontal">
            <Ellipse x:Name="dotLan" Width="10" Height="10" Fill="#22C55E" VerticalAlignment="Center"/>
            <TextBlock Text="Reach this computer" FontWeight="Bold" Foreground="#E2E8F0" Margin="8,0,0,0"/>
          </StackPanel>
          <TextBlock x:Name="txtLan" TextWrapping="Wrap" Foreground="#94A3B8" FontSize="11" Margin="18,6,0,0"/>
          <StackPanel Orientation="Horizontal" Margin="18,10,0,0">
            <Button x:Name="btnCopyLocal" Content="Copy local" Padding="8,4" Margin="0,0,6,0" FontSize="11"/>
            <Button x:Name="btnCopyLan" Content="Copy LAN" Padding="8,4" Margin="0,0,6,0" FontSize="11"/>
            <Button x:Name="btnCopyHost" Content="Copy hostname" Padding="8,4" FontSize="11"/>
          </StackPanel>
        </StackPanel>
      </Border>
    </Grid>

    <!-- Database card (full width) -->
    <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="2,0,2,8">
      <StackPanel>
        <StackPanel Orientation="Horizontal">
          <Ellipse x:Name="dotDb" Width="10" Height="10" Fill="#F87171" VerticalAlignment="Center"/>
          <TextBlock Text="Database (Supabase)" FontWeight="Bold" Foreground="#E2E8F0" Margin="8,0,0,0"/>
          <TextBlock x:Name="txtDbState" Text="Not configured" FontSize="12" Foreground="#F87171" Margin="8,0,0,0" VerticalAlignment="Center"/>
        </StackPanel>
        <Grid Margin="0,8,0,0">
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="*"/>
            <ColumnDefinition Width="Auto"/>
          </Grid.ColumnDefinitions>
          <TextBox x:Name="txtDbUrl" Height="26" FontSize="11" VerticalContentAlignment="Center" Padding="4,0"/>
          <Button x:Name="btnDbSave" Content="Save" Padding="12,4" Margin="8,0,0,0" Grid.Column="1" FontSize="11"/>
        </Grid>
        <StackPanel Orientation="Horizontal" Margin="0,6,0,0">
          <TextBlock x:Name="txtDbHint" Text="Paste your PostgreSQL connection string (Project Settings &gt; Database)."
                     Foreground="#64748B" FontSize="10" VerticalAlignment="Center"/>
          <Button x:Name="btnDbTest" Content="Test now" Padding="8,2" Margin="10,0,0,0" FontSize="10"/>
        </StackPanel>
      </StackPanel>
    </Border>

    <!-- Tools card -->
    <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="2,0,2,8">
      <StackPanel>
        <TextBlock Text="Tools" FontWeight="Bold" Foreground="#E2E8F0"/>
        <WrapPanel Margin="0,10,0,0">
          <Button x:Name="btnRepair" Content="Repair launcher" Padding="10,4" Margin="0,0,6,6" FontSize="11"/>
          <Button x:Name="btnHeal" Content="Heal firewall rule" Padding="10,4" Margin="0,0,6,6" FontSize="11"/>
          <Button x:Name="btnClean" Content="Clean junk files" Padding="10,4" Margin="0,0,6,6" FontSize="11"/>
          <Button x:Name="btnLog" Content="View server.log" Padding="10,4" Margin="0,0,6,6" FontSize="11"/>
          <Button x:Name="btnFolder" Content="Open backend folder" Padding="10,4" Margin="0,0,6,6" FontSize="11"/>
        </WrapPanel>
      </StackPanel>
    </Border>

    <!-- Settings / footer -->
    <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="2,0,2,4">
      <DockPanel>
        <StackPanel DockPanel.Dock="Left">
          <CheckBox x:Name="chkOpenBrowser" Content="Open the app in a browser after starting the server" FontSize="11" Foreground="#CBD5E1"/>
          <TextBlock x:Name="txtPort" Foreground="#94A3B8" FontSize="10" Margin="0,6,0,0"/>
        </StackPanel>
        <TextBlock x:Name="txtStatus" DockPanel.Dock="Right" TextWrapping="Wrap" Foreground="#64748B" FontSize="10"
                   HorizontalAlignment="Right" VerticalAlignment="Bottom" TextAlignment="Right" MaxWidth="260"/>
      </DockPanel>
    </Border>

  </StackPanel>
  </ScrollViewer>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
try { $window = [System.Windows.Markup.XamlReader]::Load($reader) }
catch { Write-Host "XAML load failed: $_"; exit 1 }

function Get-Ctl($n) { $window.FindName($n) }

$txtVersion    = Get-Ctl 'txtVersion'
$banner        = Get-Ctl 'banner'
$bannerTitle   = Get-Ctl 'bannerTitle'
$bannerText    = Get-Ctl 'bannerText'
$lnkDbGuide    = Get-Ctl 'lnkDbGuide'
$dotSrv        = Get-Ctl 'dotSrv'
$txtSrvState   = Get-Ctl 'txtSrvState'
$txtSrvDetail  = Get-Ctl 'txtSrvDetail'
$btnSrvStart   = Get-Ctl 'btnSrvStart'
$btnSrvStop    = Get-Ctl 'btnSrvStop'
$btnOpenApp    = Get-Ctl 'btnOpenApp'
$dotAst        = Get-Ctl 'dotAst'
$txtAstState   = Get-Ctl 'txtAstState'
$btnAstToggle  = Get-Ctl 'btnAstToggle'
$dotPx         = Get-Ctl 'dotPx'
$txtPxState    = Get-Ctl 'txtPxState'
$txtPxDetail   = Get-Ctl 'txtPxDetail'
$btnPxToggle   = Get-Ctl 'btnPxToggle'
$dotLan        = Get-Ctl 'dotLan'
$txtLan        = Get-Ctl 'txtLan'
$btnCopyLocal  = Get-Ctl 'btnCopyLocal'
$btnCopyLan    = Get-Ctl 'btnCopyLan'
$btnCopyHost   = Get-Ctl 'btnCopyHost'
$dotDb         = Get-Ctl 'dotDb'
$txtDbState    = Get-Ctl 'txtDbState'
$txtDbUrl      = Get-Ctl 'txtDbUrl'
$btnDbSave     = Get-Ctl 'btnDbSave'
$txtDbHint     = Get-Ctl 'txtDbHint'
$btnDbTest     = Get-Ctl 'btnDbTest'
$btnRepair     = Get-Ctl 'btnRepair'
$btnHeal       = Get-Ctl 'btnHeal'
$btnClean      = Get-Ctl 'btnClean'
$btnLog        = Get-Ctl 'btnLog'
$btnFolder     = Get-Ctl 'btnFolder'
$chkOpenBrowser = Get-Ctl 'chkOpenBrowser'
$txtPort       = Get-Ctl 'txtPort'
$txtStatus     = Get-Ctl 'txtStatus'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Set-Dot($ctl, [string]$hex) {
  $conv = New-Object System.Windows.Media.BrushConverter
  try { $ctl.Fill = $conv.ConvertFromString($hex) } catch {}
}

function Set-Status($msg) {
  $txtStatus.Text = $msg
}

function Read-Config {
  $script:cfg.PORT = 3002
  $script:cfg.DATABASE_URL = ''
  if (Test-Path -LiteralPath $envFile) {
    foreach ($line in (Get-Content -LiteralPath $envFile)) {
      if ($line -match '^\s*PORT=(\d+)')      { $script:cfg.PORT = [int]$Matches[1] }
      elseif ($line -match '^\s*DATABASE_URL=') { $script:cfg.DATABASE_URL = $line -replace '^\s*DATABASE_URL=','' }
    }
  }
}

function Get-LanData {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike 'vEthernet*' } |
    Select-Object -ExpandProperty IPAddress
  return @($ips)
}

function Get-ServerInfo {
  $listen = Get-NetTCPConnection -LocalPort $script:cfg.PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listen) { return @{ State = 'Stopped' } }
  $ok = $false
  try { $r = Invoke-WebRequest -Uri "http://localhost:$($script:cfg.PORT)/api/health" -UseBasicParsing -TimeoutSec 3
        $ok = ($r.StatusCode -eq 200) } catch { $ok = $false }
  if (-not $ok) { return @{ State = 'Starting' } }
  $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
  $up = ''
  if ($proc) { $up = [math]::Round((((Get-Date) - $proc.StartTime).TotalMinutes), 0) }
  return @{ State = 'Running'; Pid = $listen.OwningProcess; UptimeMin = $up }
}

function Get-ProxyInfo {
  $caddy = Get-Process caddy -ErrorAction SilentlyContinue | Select-Object -First 1
  $p80   = [bool](Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue)
  if ($caddy -and $p80) { return @{ State = 'Running' } }
  if ($caddy -or $p80)  { return @{ State = 'Partial' } }
  return @{ State = 'Stopped' }
}

# ---------------------------------------------------------------------------
# Status refresh
# ---------------------------------------------------------------------------
function Update-Status {
  Read-Config

  # Server
  $srv = Get-ServerInfo
  switch ($srv.State) {
    'Running'  { Set-Dot $dotSrv '#22C55E'; $txtSrvState.Text = 'Running'
                 $txtSrvState.Foreground = $null; $txtSrvState.Foreground = [System.Windows.Media.Brushes]::LightGreen }
    'Starting' { Set-Dot $dotSrv '#F59E0B'; $txtSrvState.Text = 'Starting...'
                 $txtSrvState.Foreground = [System.Windows.Media.Brushes]::Orange }
    default    { Set-Dot $dotSrv '#F87171'; $txtSrvState.Text = 'Stopped'
                 $txtSrvState.Foreground = [System.Windows.Media.Brushes]::LightCoral }
  }
  if ($srv.State -eq 'Stopped') {
    $txtSrvDetail.Text = "Port $($script:cfg.PORT) is free. Click Start to launch the server."
  } elseif ($srv.State -eq 'Starting') {
    $txtSrvDetail.Text = "Port $($script:cfg.PORT) is listening but not answering health checks yet."
  } else {
    $txtSrvDetail.Text = "Healthy on port $($script:cfg.PORT) - PID $($srv.Pid), up $($srv.UptimeMin) min."
  }

  # Autostart
  $ast = Test-Path -LiteralPath $startupLnk
  if ($ast) { Set-Dot $dotAst '#22C55E'; $txtAstState.Text = 'On'; $txtAstState.Foreground = [System.Windows.Media.Brushes]::LightGreen; $btnAstToggle.Content = 'Disable autostart' }
  else      { Set-Dot $dotAst '#F87171'; $txtAstState.Text = 'Off'; $txtAstState.Foreground = [System.Windows.Media.Brushes]::LightCoral; $btnAstToggle.Content = 'Enable autostart' }

  # Proxy
  $px = Get-ProxyInfo
  switch ($px.State) {
    'Running' { Set-Dot $dotPx '#22C55E'; $txtPxState.Text = 'Running'; $txtPxState.Foreground = [System.Windows.Media.Brushes]::LightGreen; $btnPxToggle.Content = 'Stop proxy' }
    'Partial' { Set-Dot $dotPx '#F59E0B'; $txtPxState.Text = 'Partial'; $txtPxState.Foreground = [System.Windows.Media.Brushes]::Orange; $btnPxToggle.Content = 'Stop proxy' }
    default   { Set-Dot $dotPx '#F87171'; $txtPxState.Text = 'Stopped'; $txtPxState.Foreground = [System.Windows.Media.Brushes]::LightCoral; $btnPxToggle.Content = 'Start proxy' }
  }
  $pxDetail = "Port 80 reverse proxy for LAN access."
  if ($px.State -ne 'Stopped') {
    if (Get-Process caddy -ErrorAction SilentlyContinue) { $pxDetail = "caddy.exe is running - http://<LAN-IP> and http://$env:COMPUTERNAME work (no :$($script:cfg.PORT))." }
  }
  $txtPxDetail.Text = $pxDetail

  # LAN
  $ips = Get-LanData
  $lanText = "Local: http://localhost:$($script:cfg.PORT)`n"
  if ($ips.Count -gt 0) {
    $lanText += "LAN: http://$($ips[0]):$($script:cfg.PORT)`n"
    $lanText += "Hostname: http://$env:COMPUTERNAME"
    if ($px.State -eq 'Running') {
      $lanText += "`n(No port needed when the proxy is running - http://$($ips[0]) / http://$env:COMPUTERNAME)"
    }
  } else {
    $lanText += "No LAN IP detected."
  }
  $txtLan.Text = $lanText
  if ($ips.Count -gt 0) { Set-Dot $dotLan '#22C55E' } else { Set-Dot $dotLan '#F87171' }

  # Database
  if (-not $script:cfg.DATABASE_URL) {
    Set-Dot $dotDb '#F87171'
    $txtDbState.Text = 'Not configured'
    $txtDbState.Foreground = [System.Windows.Media.Brushes]::LightCoral
    $txtDbUrl.Text = ''
    $txtDbHint.Text = 'Paste your PostgreSQL connection string (Project Settings > Database) and click Save.'
    $banner.Visibility = 'Visible'
    $bannerTitle.Text = 'Set up your database first'
    if (Test-Path -LiteralPath $envFile) { $bannerText.Text = 'The app is installed but no database is connected yet. Paste your Supabase connection string below, or open the guide.' }
    $script:dbText = 'Not configured'
  } else {
    $banner.Visibility = 'Collapsed'
    $txtDbUrl.Text = $script:cfg.DATABASE_URL
    $txtDbHint.Text = "Detected in backend\.env. Status shown is from a live connectivity test."
    Run-DbTest
    Set-Dot $dotDb '#F59E0B'
    $txtDbState.Text = $script:dbText
    if ($script:dbText -like 'Connected*') { $txtDbState.Foreground = [System.Windows.Media.Brushes]::LightGreen }
    elseif ($script:dbText -like 'Testing*') { $txtDbState.Foreground = [System.Windows.Media.Brushes]::Orange }
    else { $txtDbState.Foreground = 'LightCoral' }
  }
}

function Run-DbTest {
  if ($script:dbBusy) { $script:dbText = 'Testing...'; return }
  if (-not $script:cfg.DATABASE_URL) { return }
  $age = ((Get-Date) - $script:dbLast).TotalSeconds
  if ($age -lt 20) {
    if ($script:dbText -notlike 'Connected*') { $script:dbText = $script:dbText }
    return
  }
  $script:dbText = 'Testing...'
  $script:dbBusy = $true
  $script:dbLast = Get-Date
  $url  = $script:cfg.DATABASE_URL
  $nmPath = Join-Path $backend 'node_modules'
  $script:dbJob = Start-Job -ArgumentList $url, $probe, $nodeExe, $nmPath -ScriptBlock {
    param($u, $p, $node, $nmpath)
    $env:DATABASE_URL = $u
    $env:NODE_PATH = $nmpath
    $o = & $node $p 2>&1 | Out-String
    return ($o.Trim())
  }
}

function End-DbTest {
  if (-not $script:dbJob) { return }
  $out = (Receive-Job $script:dbJob -Keep 2>&1 | Out-String).Trim()
  if ($script:dbJob.State -in 'Completed','Failed','Stopped') {
    if ($out -like 'OK*') { $script:dbText = 'Connected - healthy' }
    elseif ($out)         { $script:dbText = $out.Substring(0, [Math]::Min(60, $out.Length)) }
    else                  { $script:dbText = 'Test failed (no output)' }
    Remove-Job $script:dbJob -Force -ErrorAction SilentlyContinue
    $script:dbJob = $null
    $script:dbBusy = $false
  } else {
    $script:dbText = 'Testing...'
  }
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
function Start-Server {
  $ps1 = Join-Path $winDir 'start-server.ps1'
  $mode = 'open'
  if (-not $chkOpenBrowser.IsChecked) { $mode = 'hidden' }
  Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',("`"$ps1`""),'-Mode',$mode -WindowStyle Hidden
  Set-Status "Starting the server (mode $mode)..."
}

function Stop-Server {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'start-server-core\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-NetTCPConnection -LocalPort $script:cfg.PORT -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Stop-Proxy
  Set-Status 'Server stopped.'
}

function Stop-Proxy {
  Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'EncodedCommand' -and $_.CommandLine -match 'caddy' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Set-Status 'Proxy stopped (Caddy + watchdog).'
}

function Toggle-Autostart {
  if (Test-Path -LiteralPath $startupLnk) {
    Remove-Item -LiteralPath $startupLnk -Force -ErrorAction SilentlyContinue
    Set-Status 'Autostart disabled.'
  } else {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($startupLnk)
    $sc.TargetPath = 'wscript.exe'
    $q = [char]34
    $sc.Arguments = $q + (Join-Path $winDir 'Start Server Hidden.vbs') + $q
    $sc.WorkingDirectory = $winDir
    $sc.Description = 'Workstation Meva server'
    $sc.Save()
    Set-Status 'Autostart enabled - will start at every login.'
  }
}

function Toggle-Proxy {
  $px = Get-ProxyInfo
  if ($px.State -ne 'Stopped') { Stop-Proxy }
  else {
    $caddy = Join-Path $root 'proxy\caddy\caddy.exe'
    if (Test-Path -LiteralPath $caddy) {
      Start-Process -FilePath $caddy -WorkingDirectory (Split-Path -Parent $caddy) -ArgumentList 'run','--config','Caddyfile' -WindowStyle Minimized
      Set-Status 'Proxy started.'
    } else { Set-Status 'Caddy not found (proxy\caddy\caddy.exe).' }
  }
}

function Save-DbUrl {
  $url = $txtDbUrl.Text.Trim()
  if ($url -and $url -notmatch '^postgres(ql)?://') {
    Set-Status 'That does not look like a PostgreSQL URL (starts with postgresql://).'
    return
  }
  if (-not (Test-Path -LiteralPath $envFile)) {
    $example = Join-Path $backend '.env.example'
    if (Test-Path -LiteralPath $example) {
      $secret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
      $content = (Get-Content -LiteralPath $example -Raw) -replace '^JWT_SECRET=.*$', ('JWT_SECRET=' + $secret)
      Set-Content -LiteralPath $envFile -Value $content -Encoding ascii
    }
  }
  if (Test-Path -LiteralPath $envFile) {
    $lines = @(Get-Content -LiteralPath $envFile)
    $found = $false
    $new = foreach ($l in $lines) {
      if ($l -match '^\s*DATABASE_URL=') { $found = $true; 'DATABASE_URL=' + $url }
      else { $l }
    }
    if (-not $found) { $new += 'DATABASE_URL=' + $url }
    Set-Content -LiteralPath $envFile -Value $new -Encoding ascii
    $script:dbLast = (Get-Date).AddMinutes(-10)
    $script:dbText = 'Testing...'
    Set-Status 'Database URL saved.'
  } else {
    Set-Status 'Could not find or create backend\.env.'
  }
}

function Open-Url($u) { try { Start-Process $u } catch { Set-Status "Could not open $u" } }

function Copy-ToClip($text) {
  if (-not $text) { return }
  try { [System.Windows.Clipboard]::SetText($text); Set-Status "Copied: $text" }
  catch { Set-Status 'Copy failed (clipboard unavailable).' }
}

# ---------------------------------------------------------------------------
# Wire events
# ---------------------------------------------------------------------------
$btnSrvStart.Add_Click({ Start-Server; Update-Status })
$btnSrvStop.Add_Click({ Stop-Server; Update-Status })
$btnOpenApp.Add_Click({ Open-Url "http://localhost:$($script:cfg.PORT)" })
$btnAstToggle.Add_Click({ Toggle-Autostart; Update-Status })
$btnPxToggle.Add_Click({ Toggle-Proxy; Update-Status })
$btnDbSave.Add_Click({ Save-DbUrl; Update-Status })
$btnDbTest.Add_Click({ $script:dbLast = (Get-Date).AddMinutes(-10); $script:dbText='Testing...'; Update-Status })
$btnRepair.Add_Click({
  $ps1 = Join-Path $winDir 'start-server.ps1'
  Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',("`"$ps1`""),'-Mode','repair' -WindowStyle Hidden
  Set-Status 'Repair started - see server.log for results.'
})
$btnHeal.Add_Click({ Start-Process (Join-Path $winDir 'firewall-heal.bat') -Verb RunAs; Set-Status 'Healing firewall rule (accept the UAC prompt).' })
$btnClean.Add_Click({ Start-Process -FilePath (Join-Path $winDir 'Clean Junk.bat') -ArgumentList 'silent' -WindowStyle Hidden; Set-Status 'Junk cleanup started (logs/build cache older than 7 days).' })
$btnLog.Add_Click({
  if (Test-Path -LiteralPath $logFile) { Start-Process notepad $logFile } else { Set-Status 'server.log does not exist yet.' }
})
$btnFolder.Add_Click({ if (Test-Path -LiteralPath $backend) { Start-Process explorer.exe $backend } else { Set-Status 'backend folder not found.' } })
$lnkDbGuide.Add_Click({ Open-Url 'https://github.com/abcnew2025/workstation/blob/main/docs/SETUP-SUPABASE.md' })

$btnCopyLocal.Add_Click({ Copy-ToClip "http://localhost:$($script:cfg.PORT)" })
$btnCopyLan.Add_Click({ $ips = Get-LanData; if ($ips.Count -gt 0) { Copy-ToClip "http://$($ips[0]):$($script:cfg.PORT)" } })
$btnCopyHost.Add_Click({ Copy-ToClip "http://$env:COMPUTERNAME" })

# ---------------------------------------------------------------------------
# Kick-off
# ---------------------------------------------------------------------------
$frontPkg = Join-Path $root 'frontend\package.json'
if (Test-Path -LiteralPath $frontPkg) {
  $ver = (Get-Content -LiteralPath $frontPkg -Raw | ConvertFrom-Json).version
  $txtVersion.Text = "v$ver - pre-release beta"
}

End-DbTest | Out-Null
$chkOpenBrowser.IsChecked = $true
Update-Status

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(3)
$timer.Add_Tick({ End-DbTest; Update-Status })
$timer.Start()

# Hidden smoke-test hook: build the UI and run one refresh, then exit without
# showing the window. Used by development/QA (WM_PANEL_TEST=1). Users never see this.
if ($env:WM_PANEL_TEST -eq '1') {
  try { $timer.Stop() } catch {}
  Write-Output 'PANEL-OK'
  exit 0
}

$window.ShowDialog() | Out-Null
try { $timer.Stop() } catch {}
if ($script:dbJob) { Remove-Job $script:dbJob -Force -ErrorAction SilentlyContinue }
exit 0