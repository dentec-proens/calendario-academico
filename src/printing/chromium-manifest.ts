export const chromiumVersion = '153.0.0';
export const chromiumArchives = ['chromium', 'fonts', 'swiftshader', 'al2023'] as const;
export type ChromiumArchiveName = (typeof chromiumArchives)[number];
export type ChromiumArchive = { storageId: string; sha256: string; size: number };
export type ChromiumManifest = {
  version: typeof chromiumVersion;
  architectures: Record<'x64' | 'arm64', Record<ChromiumArchiveName, ChromiumArchive>>;
};
export type ChromiumRuntime = {
  version: typeof chromiumVersion;
  arch: 'x64' | 'arm64';
  archives: Array<{ name: ChromiumArchiveName; url: string; sha256: string; size: number }>;
};

export function parseChromiumManifest(value: string | undefined): ChromiumManifest {
  try {
    const manifest: ChromiumManifest = JSON.parse(value ?? '');
    if (manifest?.version !== chromiumVersion) throw Error();
    for (const arch of ['x64', 'arm64'] as const)
      for (const name of chromiumArchives) {
        const item = manifest.architectures[arch][name];
        if (
          typeof item?.storageId !== 'string' ||
          !item.storageId ||
          !/^[a-f0-9]{64}$/.test(item.sha256) ||
          !Number.isSafeInteger(item.size) ||
          item.size < 1 ||
          item.size > 200 * 1024 * 1024
        )
          throw Error();
      }
    return manifest;
  } catch {
    throw Error(
      'Runtime PDF ausente ou inválido. Execute pnpm runtime:prepare no deployment selecionado.',
    );
  }
}
