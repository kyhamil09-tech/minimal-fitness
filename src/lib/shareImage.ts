import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Sends a PNG (as a data URL) out through the phone's own share sheet. The picture is written to the app's private cache first;
 * nothing goes anywhere until you pick an app in the sheet. Outside the Android app it downloads the file instead.
 */
export const shareImage = async (dataUrl: string, filename: string, title = 'My workout'): Promise<'shared' | 'saved'> => {
  if (Capacitor.isNativePlatform()) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title, url: written.uri, dialogTitle: 'Share your workout' });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'saved';
};
