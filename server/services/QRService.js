import QRCode from 'qrcode'
import os from 'os'

// Get local IP address
export function getLocalIP() {
  const interfaces = os.networkInterfaces()
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.internal || iface.family !== 'IPv4') continue
      // Prefer en0 (Ethernet/WiFi on Mac)
      if (name.startsWith('en') || name === 'Wi-Fi') {
        return iface.address
      }
    }
  }
  
  // Fallback to any available
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address
      }
    }
  }
  
  return 'localhost'
}

// Generate QR code as data URL
export async function generateQRCodeUrl(port = 3000) {
  const ip = getLocalIP()
  const url = `http://${ip}:${port}`
  
  return {
    url,
    qrCode: await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#c9a84c',  // Gold accent
        light: '#1a1a2e'   // Dark background
      }
    })
  }
}

// Generate QR code as SVG string
export async function generateQRSvg(port = 3000) {
  const ip = getLocalIP()
  const url = `http://${ip}:${port}`
  
  return {
    url,
    qrSvg: await QRCode.toString(url, {
      type: 'svg',
      width: 300,
      margin: 2,
      color: {
        dark: '#c9a84c',
        light: '#1a1a2e'
      }
    })
  }
}

export default { getLocalIP, generateQRCodeUrl, generateQRSvg }
