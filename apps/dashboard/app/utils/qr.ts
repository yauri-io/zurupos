// QR codes are drawn in the browser, never on the server (D-080). They encode
// `<MENU_PUBLIC_BASE_URL>/<slug>?s=qr` (the API's `qr_url`), error correction M.
import QRCode from 'qrcode'

export const QR_PNG_SIZE = 1024

export const qrDataUrl = (text: string, width = QR_PNG_SIZE): Promise<string> =>
  QRCode.toDataURL(text, {
    width,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
