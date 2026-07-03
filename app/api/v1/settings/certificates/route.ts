import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { arcaService } from '@/lib/arca/service'

const CERTS_DIR = '/data/certs'

export async function PUT(request: NextRequest) {
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

  await mkdir(CERTS_DIR, { recursive: true })
  await writeFile(`${CERTS_DIR}/cert.crt`, Buffer.from(await certFile.arrayBuffer()))
  await writeFile(`${CERTS_DIR}/cert.key`, Buffer.from(await keyFile.arrayBuffer()))

  try {
    await arcaService.reload()
  } catch (err) {
    return NextResponse.json(
      { error: 'Certificates saved but failed to initialize: ' + (err instanceof Error ? err.message : 'Unknown error') },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true })
}
