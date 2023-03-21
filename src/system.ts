import os from 'os';

const platformMap: {[key: string]: string} = {
  darwin: 'macos',
  freebsd: 'freebsd',
  linux: 'linux',
  win32: 'windows'
};

export function getPlatform(): string {
  const plat: string = os.platform();
  return platformMap[plat] || plat;
}

// wants aarch64 riscv64 x86_64 aarch64 x86_64
const archMap: {[key: string]: string} = {
  arm64: 'aarch64',
  x64: 'x86_64'
};

export function getArch(arch: string): string {
  return archMap[arch] || arch;
}
