import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export interface ColumnProps {
  id: string;
  label: string;
  // Kiekis ateina iš `Board` sąrašo, o ne skaičiuojamas iš `children`: tempiama
  // kortelė ten yra apvyniota `DraggableCard`, tad `Children.count` skaičiuotų
  // apvalkalus, ne užduotis, ir tyliai išsiskirtų su tikrove.
  count: number;
  children: ReactNode;
}

export function Column({ id, label, count, children }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className="kolona"
      data-testid={`kolona-${label}`}
      data-virs={isOver}
    >
      <h2>
        {label}
        <span className="skaicius">{count}</span>
      </h2>
      <div className="kolonos-turinys">{children}</div>
    </section>
  );
}
