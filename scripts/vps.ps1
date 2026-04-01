# ============================================
# Conectar ao VPS - uso diario
# ============================================
# Uso:
#   .\scripts\vps.ps1           -> entra como root
#   .\scripts\vps.ps1 leadcapture -> entra como leadcapture
# ============================================

$VPS_IP = "187.77.230.211"
$USER   = if ($args[0]) { $args[0] } else { "root" }

ssh "${USER}@${VPS_IP}"
