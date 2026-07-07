import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { arcaService, type ArcaEnv } from '@/lib/arca/service'

const CERTS_DIR = '/data/certs'

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const envParam = searchParams.get('env')
  const env: ArcaEnv = envParam === 'sandbox' ? 'sandbox' : 'production'

  const formData = await request.formData()
  const certFile = formData.get('cert') as File | null
  const keyFile = formData.get('key') as File | null

  if (!certFile || !keyFile) {
    return NextResponse.json(
      { error: 'Both cert and key files are required' },
      { status: 400 }
    )
  }

  const certContent = await certFile.text()
  const keyContent = await keyFile.text()

  if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
    return NextResponse.json({ error: 'Invalid certificate file' }, { status: 400 })
  }
  if (!keyContent.includes('-----BEGIN')) {
    return NextResponse.json({ error: 'Invalid private key file' }, { status: 400 })
  }

  const dir = `${CERTS_DIR}/${env}`
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/cert.crt`, Buffer.from(await certFile.arrayBuffer()))
    await writeFile(`${dir}/cert.key`, Buffer.from(await keyFile.arrayBuffer()))
    console.log(`[PUT /api/v1/settings/certificates] Written certs for env=${env}`)
  } catch (err) {
    console.error('[PUT /api/v1/settings/certificates] File write error:', err)
    return NextResponse.json({ error: 'Failed to save certificate files', details: String(err) }, { status: 500 })
  }

  // Only reload the live client if we just updated the active env's certs
  if (env === arcaService.getActiveEnv()) {
    try {
      await arcaService.reload()
      console.log(`[PUT /api/v1/settings/certificates] arcaService reloaded for env=${env}`)
    } catch (err) {
      console.error('[PUT /api/v1/settings/certificates] arcaService reload error:', err)
      return NextResponse.json(
        { error: 'Certificates saved but failed to initialize: ' + (err instanceof Error ? err.message : 'Unknown error') },
        { status: 422 }
      )
    }
  }

  return NextResponse.json({ ok: true, env })
}
