import QRCode from 'qrcode';

export function createQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 256,
  });
}
