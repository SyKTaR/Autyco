import type { PropsWithChildren } from 'react'

interface InventoryCardProps {
  className?: string
}

export const InventoryCard = ({ children, className = '' }: PropsWithChildren<InventoryCardProps>) => (
  <article className={`panel ${className}`}>{children}</article>
)
