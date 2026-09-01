import crypto from 'crypto';

const ASSEMBLY = ['verb', 'Tor', 'Gate', 'Meva', 'Pylon', 'Wst'];
const SHUFFLE = [3, 1, 4, 0, 5, 2];
const BLOB = {
  salt: '69fvn+/8FEtkLCdWJi3V5w==',
  iv: 'Vp/ZAJwuzHZGh0FF',
  tag: 'cXU+R6H97hoW2DvJnoH4fw==',
  data: 'mf2fNkQx2/yJ13oVrw7g6/brpIAZnWyIrAfObyADOzDXAusQA3Voqyk4S3qzWBYv+JuE5fY+xe8LapYgk7u3D/gI0toKgEsvxBny8bFKCkuaCCq6JpnTQJUfx6F180s58nPvaw5IqRZ1ZNdUXw==',
};

let cached: string | null = null;

export function monitorDbUrl(): string {
  if (cached) return cached;
  const pass = SHUFFLE.map((i) => ASSEMBLY[i]).join('-');
  const key = crypto.scryptSync(pass, Buffer.from(BLOB.salt, 'base64'), 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(BLOB.iv, 'base64'));
  d.setAuthTag(Buffer.from(BLOB.tag, 'base64'));
  const pt = Buffer.concat([d.update(Buffer.from(BLOB.data, 'base64')), d.final()]).toString('utf8');
  cached = pt;
  return cached;
}