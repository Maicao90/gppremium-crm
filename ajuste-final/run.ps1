param([string]$script)
cmd /c "ssh -i %USERPROFILE%\.ssh\vps_gppremium root@2.24.212.146 bash -s < C:\Users\MaiconBatn\gp-robo\ajuste-final\$script"
