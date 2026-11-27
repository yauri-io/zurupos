import type { MediaConfig } from '../config/env.js'
import { createLocalStore } from './local-store.js'
import { createS3Store } from './s3-store.js'
import type { MediaStore } from './store.js'

export const createMediaStore = (config: MediaConfig): MediaStore => {
  if (config.driver === 's3') {
    if (!config.s3) throw new Error('MEDIA_DRIVER=s3 needs the MEDIA_S3_* variables')
    return createS3Store({ ...config.s3, publicBaseUrl: config.publicBaseUrl })
  }
  if (!config.localDir) throw new Error('MEDIA_DRIVER=local needs MEDIA_LOCAL_DIR')
  return createLocalStore({ dir: config.localDir, publicBaseUrl: config.publicBaseUrl })
}
