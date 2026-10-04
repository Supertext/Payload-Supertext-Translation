import type { ReactNode } from 'react'

import './styles.css'

export const metadata = {
  description: 'Demo of the Supertext translation plugin for Payload CMS',
  title: 'Supertext × Payload demo',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
