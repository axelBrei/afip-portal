import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync } from 'fs'
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

  mkdirSync(CERTS_DIR, { recursive: true })
  writeFileSync(`${CERTS_DIR}/cert.crt`, certContent, 'utf-8')
  writeFileSync(`${CERTS_DIR}/cert.key`, keyContent, 'utf-8')

  arcaService.reload()

  return NextResponse.json({ ok: true })
}
