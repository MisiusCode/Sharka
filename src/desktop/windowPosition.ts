export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TARPAS = 8;

export function popupBounds(
  tray: Bounds,
  workArea: Bounds,
  size: { width: number; height: number },
): Bounds {
  const trayCenter = tray.x + tray.width / 2;
  const minX = workArea.x + TARPAS;
  // Ekrane, siauresniame už patį langą, maxX taptų mažesnis už minX ir
  // Math.min galutinai nustumtų langą už kairiojo krašto. Riba prispaudžiama.
  const maxX = Math.max(workArea.x + workArea.width - size.width - TARPAS, minX);
  const x = Math.min(Math.max(trayCenter - size.width / 2, minX), maxX);

  // Sprendžiame pagal tai, kurioje darbo srities pusėje yra tray ikonos
  // CENTRAS, o ne pagal tikslią apatinę ribą. Windows 11 tray.y ne visada
  // lygus tiksliai workArea apačiai (priklauso nuo ekrano mastelio/DPI ir
  // to, kaip Windows praneša juostos geometriją) — ikona gali būti šiek
  // tiek virš ribos, bet vis tiek vizualiai apatinėje juostoje.
  const trayCenterY = tray.y + tray.height / 2;
  const trayInBottomHalf = trayCenterY >= workArea.y + workArea.height / 2;
  const y = trayInBottomHalf
    ? workArea.y + workArea.height - size.height - TARPAS
    : workArea.y + TARPAS;

  return { x: Math.round(x), y: Math.round(y), ...size };
}
