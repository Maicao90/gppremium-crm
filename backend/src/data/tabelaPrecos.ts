export interface ItemPreco {
  medida: string;
  modelo: string;
  categoria: 'passeio' | 'suv' | 'van' | 'pickup' | 'recape';
  promocao?: boolean;
  compre3Leve4?: boolean;
  aVista: number;
  parcelado: {
    x1: number;
    x2: number;
    x3: number;
    x4: number;
    x5: number;
    x6: number;
    x7: number;
    x8: number;
    x9: number;
    x10: number;
  };
  portaria?: number;
}

export interface MatchPreco {
  medidaConsultada: string;
  itens: ItemPreco[];
}

export interface AnaliseConsultaPreco {
  medidasDetectadas: string[];
  matchesExatos: MatchPreco[];
  ambiguas: MatchPreco[];
  semResultado: string[];
}

export interface RespostaDeterministicaPreco {
  partes: string[];
  usouTabela: boolean;
}

// TABELA OFICIAL DE PRECOS — gerada da planilha do dono da loja em 02/09/2026
// (Tabela_de_Precos_Pneus_Organizada.xlsx).
//
// NAO edite valor aqui na mao. Se o preco mudar, peca a planilha nova e gere de
// novo: e ela a fonte da verdade. A conferencia anterior achou 13 itens com preco
// errado, 11 faltando e 10 sobrando — inclusive 175/65/14 e 175/70/14 com os
// precos TROCADOS entre si, e um 235/75/15 R$50 abaixo do real.
//
// Cada xN e o TOTAL a financiar em N vezes (nao o valor de cada parcela) — o valor
// de cada parcela e xN / N.
//
// Linhas com o mesmo preco e medida foram juntadas num item so, com os modelos
// separados por " / " (ex.: 195/65/15 GP-1 e GP-7 sao a mesma cotacao). Assim o robo
// nao pergunta "qual modelo?" quando o valor e igual de qualquer jeito.
//
// Os RECAPES no fim nao vem da planilha — sao produto proprio da loja, mantidos
// como estavam.
export const TABELA_PRECOS_GP: ItemPreco[] = [
  {
    medida: '165/70/13',
    modelo: 'GP-7',
    categoria: 'passeio',
    promocao: true,
    aVista: 239.00,
    parcelado: { x1: 244.31, x2: 246.96, x3: 249.61, x4: 252.26, x5: 254.92, x6: 257.57, x7: 260.22, x8: 262.88, x9: 265.53, x10: 268.18 },
    portaria: 30.00
  },
  {
    medida: '165/70/14',
    modelo: 'GP-7',
    categoria: 'passeio',
    promocao: true,
    aVista: 239.00,
    parcelado: { x1: 244.31, x2: 246.96, x3: 249.61, x4: 252.26, x5: 254.92, x6: 257.57, x7: 260.22, x8: 262.88, x9: 265.53, x10: 268.18 },
    portaria: 30.00
  },
  {
    medida: '175/70/13',
    modelo: 'GP-1 / GP-7 / GP-400',
    categoria: 'passeio',
    promocao: true,
    aVista: 269.00,
    parcelado: { x1: 274.97, x2: 277.96, x3: 280.94, x4: 283.93, x5: 286.92, x6: 289.90, x7: 292.89, x8: 295.87, x9: 298.86, x10: 301.34 },
    portaria: 30.00
  },
  {
    medida: '175/65/14',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    promocao: true,
    aVista: 249.00,
    parcelado: { x1: 254.53, x2: 257.29, x3: 260.06, x4: 262.82, x5: 265.58, x6: 268.35, x7: 271.11, x8: 273.88, x9: 276.64, x10: 279.40 },
    portaria: 30.00
  },
  {
    medida: '175/70/14',
    modelo: 'GP-1 / GP-7 / ATR',
    categoria: 'passeio',
    promocao: true,
    aVista: 279.00,
    parcelado: { x1: 285.19, x2: 288.29, x3: 291.39, x4: 294.48, x5: 297.58, x6: 300.68, x7: 303.78, x8: 306.87, x9: 309.97, x10: 313.07 },
    portaria: 30.00
  },
  {
    medida: '185/60/14',
    modelo: 'GP-1',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 0.00
  },
  {
    medida: '185/65/14',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 30.00
  },
  {
    medida: '185/70/14',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 30.00
  },
  {
    medida: '185/60/15',
    modelo: 'GP-1',
    categoria: 'passeio',
    promocao: true,
    aVista: 249.00,
    parcelado: { x1: 254.53, x2: 257.29, x3: 260.06, x4: 262.82, x5: 265.58, x6: 268.35, x7: 271.11, x8: 273.88, x9: 276.64, x10: 279.40 },
    portaria: 20.00
  },
  {
    medida: '185/65/15',
    modelo: 'GP-1',
    categoria: 'passeio',
    promocao: true,
    aVista: 249.00,
    parcelado: { x1: 254.53, x2: 257.29, x3: 260.06, x4: 262.82, x5: 265.58, x6: 268.35, x7: 271.11, x8: 273.88, x9: 276.64, x10: 279.40 },
    portaria: 20.00
  },
  {
    medida: '195/55/15',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 20.00
  },
  {
    medida: '195/60/15',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 20.00
  },
  {
    medida: '195/65/15',
    modelo: 'GP-1 / GP-7',
    categoria: 'passeio',
    compre3Leve4: true,
    aVista: 328.90,
    parcelado: { x1: 336.20, x2: 339.85, x3: 343.50, x4: 347.15, x5: 350.80, x6: 354.46, x7: 358.11, x8: 361.76, x9: 365.41, x10: 369.06 },
    portaria: 20.00
  },
  {
    medida: '205/60/15',
    modelo: 'GP-1',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 20.00
  },
  {
    medida: '205/60/15',
    modelo: 'ADVENTURE ATR',
    categoria: 'passeio',
    aVista: 319.00,
    parcelado: { x1: 326.08, x2: 329.62, x3: 333.16, x4: 336.70, x5: 340.25, x6: 343.79, x7: 347.33, x8: 350.87, x9: 354.41, x10: 357.95 },
    portaria: 20.00
  },
  {
    medida: '205/65/15',
    modelo: 'ADVENTURE ATR',
    categoria: 'passeio',
    aVista: 339.00,
    parcelado: { x1: 346.53, x2: 350.29, x3: 354.05, x4: 357.81, x5: 361.58, x6: 365.34, x7: 369.10, x8: 372.87, x9: 376.63, x10: 380.39 },
    portaria: 30.00
  },
  {
    medida: '205/70/15',
    modelo: 'ADVENTURE A/T / ADVENTURE ATR',
    categoria: 'passeio',
    aVista: 349.00,
    parcelado: { x1: 356.75, x2: 360.62, x3: 364.50, x4: 368.37, x5: 372.24, x6: 376.12, x7: 379.99, x8: 383.87, x9: 387.74, x10: 391.51 },
    portaria: 30.00
  },
  {
    medida: '205/70/15',
    modelo: 'BRUTUS T/A',
    categoria: 'passeio',
    aVista: 389.00,
    parcelado: { x1: 397.64, x2: 401.95, x3: 406.27, x4: 410.59, x5: 414.91, x6: 419.23, x7: 423.54, x8: 427.86, x9: 432.18, x10: 436.50 },
    portaria: 30.00
  },
  {
    medida: '195/55/16',
    modelo: 'GP-7',
    categoria: 'passeio',
    promocao: true,
    aVista: 259.00,
    parcelado: { x1: 264.75, x2: 267.62, x3: 270.50, x4: 273.37, x5: 276.25, x6: 279.12, x7: 282.00, x8: 284.87, x9: 287.75, x10: 290.62 },
    portaria: 20.00
  },
  {
    medida: '205/55/16',
    modelo: 'GP-1 / GP-4',
    categoria: 'passeio',
    aVista: 289.00,
    parcelado: { x1: 295.42, x2: 298.62, x3: 301.83, x4: 305.04, x5: 308.25, x6: 311.46, x7: 314.66, x8: 317.87, x9: 321.08, x10: 324.29 },
    portaria: 20.00
  },
  {
    medida: '205/60/16',
    modelo: 'ADVENTURE ATR / GP-700',
    categoria: 'passeio',
    aVista: 329.00,
    parcelado: { x1: 336.30, x2: 339.96, x3: 343.61, x4: 347.26, x5: 350.91, x6: 354.56, x7: 358.22, x8: 361.87, x9: 365.52, x10: 369.17 },
    portaria: 20.00
  },
  {
    medida: '205/50/17',
    modelo: 'GP-4',
    categoria: 'passeio',
    aVista: 339.00,
    parcelado: { x1: 346.53, x2: 350.29, x3: 354.05, x4: 357.81, x5: 361.58, x6: 365.34, x7: 369.10, x8: 372.87, x9: 376.63, x10: 380.39 },
    portaria: 20.00
  },
  {
    medida: '205/55/17',
    modelo: 'GP-4',
    categoria: 'passeio',
    aVista: 349.00,
    parcelado: { x1: 356.75, x2: 360.62, x3: 364.50, x4: 368.37, x5: 372.24, x6: 376.12, x7: 379.99, x8: 383.87, x9: 387.74, x10: 391.51 },
    portaria: 20.00
  },
  {
    medida: '215/50/17',
    modelo: 'GP-4',
    categoria: 'passeio',
    aVista: 329.00,
    parcelado: { x1: 336.30, x2: 339.96, x3: 343.61, x4: 347.26, x5: 350.91, x6: 354.56, x7: 358.22, x8: 361.87, x9: 365.52, x10: 369.17 },
    portaria: 20.00
  },
  {
    medida: '215/55/17',
    modelo: 'GP-4',
    categoria: 'passeio',
    compre3Leve4: true,
    aVista: 394.90,
    parcelado: { x1: 403.67, x2: 408.05, x3: 412.43, x4: 416.82, x5: 421.20, x6: 425.58, x7: 429.97, x8: 434.35, x9: 438.73, x10: 443.12 },
    portaria: 20.00
  },
  {
    medida: '225/45/17',
    modelo: 'GP-7',
    categoria: 'passeio',
    aVista: 339.00,
    parcelado: { x1: 346.53, x2: 350.29, x3: 354.05, x4: 357.81, x5: 361.58, x6: 365.34, x7: 369.10, x8: 372.87, x9: 376.63, x10: 380.39 },
    portaria: 20.00
  },
  {
    medida: '225/50/17',
    modelo: 'GP-7',
    categoria: 'passeio',
    aVista: 349.00,
    parcelado: { x1: 356.75, x2: 360.62, x3: 364.50, x4: 368.37, x5: 372.24, x6: 376.12, x7: 379.99, x8: 383.87, x9: 387.74, x10: 391.51 },
    portaria: 20.00
  },
  {
    medida: '255/40/17',
    modelo: 'GP-7 DRIFT',
    categoria: 'passeio',
    aVista: 599.00,
    parcelado: { x1: 612.30, x2: 618.95, x3: 625.60, x4: 632.24, x5: 638.89, x6: 645.54, x7: 652.19, x8: 658.84, x9: 665.49, x10: 672.14 },
    portaria: 20.00
  },
  {
    medida: '255/35/18',
    modelo: 'GP-3 DRIFT',
    categoria: 'suv',
    aVista: 649.00,
    parcelado: { x1: 663.41, x2: 670.61, x3: 677.82, x4: 685.02, x5: 692.22, x6: 699.43, x7: 706.63, x8: 713.84, x9: 721.04, x10: 728.24 },
    portaria: 20.00
  },
  {
    medida: '265/35/18',
    modelo: 'GP-Zero +',
    categoria: 'suv',
    aVista: 1180.00,
    parcelado: { x1: 1206.20, x2: 1219.29, x3: 1232.39, x4: 1245.49, x5: 1258.59, x6: 1271.69, x7: 1284.78, x8: 1297.88, x9: 1310.98, x10: 1324.08 },
    portaria: 0.00
  },
  {
    medida: '215/60/17',
    modelo: 'ADVENTURE VERDE',
    categoria: 'suv',
    aVista: 359.00,
    parcelado: { x1: 366.97, x2: 370.95, x3: 374.94, x4: 378.92, x5: 382.91, x6: 386.89, x7: 390.88, x8: 394.86, x9: 398.85, x10: 402.83 },
    portaria: 20.00
  },
  {
    medida: '215/65/16',
    modelo: 'ADVENTURE VERDE',
    categoria: 'suv',
    aVista: 349.00,
    parcelado: { x1: 356.75, x2: 360.62, x3: 364.50, x4: 368.37, x5: 372.24, x6: 376.12, x7: 379.99, x8: 383.87, x9: 387.74, x10: 391.51 },
    portaria: 20.00
  },
  {
    medida: '225/65/17',
    modelo: 'ADVENTURE VERDE',
    categoria: 'suv',
    aVista: 399.00,
    parcelado: { x1: 407.86, x2: 412.29, x3: 416.72, x4: 421.14, x5: 425.57, x6: 430.00, x7: 434.43, x8: 438.86, x9: 443.29, x10: 447.72 },
    portaria: 20.00
  },
  {
    medida: '225/55/18',
    modelo: 'ADVENTURE VERDE',
    categoria: 'suv',
    aVista: 399.00,
    parcelado: { x1: 407.86, x2: 412.29, x3: 416.72, x4: 421.14, x5: 425.57, x6: 430.00, x7: 434.43, x8: 438.86, x9: 443.29, x10: 447.72 },
    portaria: 20.00
  },
  {
    medida: '225/60/18',
    modelo: 'ADVENTURE H/T',
    categoria: 'pickup',
    aVista: 449.00,
    parcelado: { x1: 458.97, x2: 463.95, x3: 468.94, x4: 473.92, x5: 478.90, x6: 483.89, x7: 488.87, x8: 493.86, x9: 498.84, x10: 503.82 },
    portaria: 20.00
  },
  {
    medida: '205/70/15',
    modelo: 'CARGO DURAMAX',
    categoria: 'van',
    aVista: 429.00,
    parcelado: { x1: 438.52, x2: 443.29, x3: 448.05, x4: 452.81, x5: 457.57, x6: 462.33, x7: 467.10, x8: 471.86, x9: 476.62, x10: 481.38 },
    portaria: 30.00
  },
  {
    medida: '205/75/16',
    modelo: 'CARGO DURAMAX',
    categoria: 'van',
    aVista: 439.00,
    parcelado: { x1: 448.75, x2: 453.62, x3: 458.49, x4: 463.36, x5: 468.24, x6: 473.11, x7: 477.98, x8: 482.86, x9: 487.73, x10: 492.60 },
    portaria: 30.00
  },
  {
    medida: '225/65/16',
    modelo: 'CARGO DURAMAX',
    categoria: 'van',
    aVista: 449.00,
    parcelado: { x1: 458.97, x2: 463.95, x3: 468.94, x4: 473.92, x5: 478.90, x6: 483.89, x7: 488.87, x8: 493.86, x9: 498.84, x10: 503.82 },
    portaria: 30.00
  },
  {
    medida: '225/75/16',
    modelo: 'CARGO DURAMAX',
    categoria: 'van',
    aVista: 469.00,
    parcelado: { x1: 479.41, x2: 484.62, x3: 489.82, x4: 495.03, x5: 500.24, x6: 505.44, x7: 510.65, x8: 515.85, x9: 521.06, x10: 526.26 },
    portaria: 30.00
  },
  {
    medida: '235/75/15',
    modelo: 'ADVENTURE A/T',
    categoria: 'pickup',
    aVista: 489.00,
    parcelado: { x1: 499.86, x2: 505.28, x3: 510.71, x4: 516.14, x5: 521.57, x6: 527.00, x7: 532.42, x8: 537.85, x9: 543.28, x10: 548.71 },
    portaria: 50.00
  },
  {
    medida: '235/70/16',
    modelo: 'ADVENTURE ATR',
    categoria: 'pickup',
    aVista: 469.00,
    parcelado: { x1: 479.41, x2: 484.62, x3: 489.82, x4: 495.03, x5: 500.24, x6: 505.44, x7: 510.65, x8: 515.85, x9: 521.06, x10: 526.26 },
    portaria: 50.00
  },
  {
    medida: '235/70/16',
    modelo: 'BRUTUS T/A',
    categoria: 'pickup',
    aVista: 489.00,
    parcelado: { x1: 499.86, x2: 505.28, x3: 510.71, x4: 516.14, x5: 521.57, x6: 527.00, x7: 532.42, x8: 537.85, x9: 543.28, x10: 548.71 },
    portaria: 50.00
  },
  {
    medida: '245/70/16',
    modelo: 'ADVENTURE ATR',
    categoria: 'pickup',
    aVista: 479.00,
    parcelado: { x1: 489.63, x2: 494.95, x3: 500.27, x4: 505.58, x5: 510.90, x6: 516.22, x7: 521.54, x8: 526.85, x9: 532.17, x10: 537.49 },
    portaria: 40.00
  },
  {
    medida: '255/70/16',
    modelo: 'BRUTUS T/A',
    categoria: 'pickup',
    aVista: 539.00,
    parcelado: { x1: 550.97, x2: 556.95, x3: 562.93, x4: 568.91, x5: 574.90, x6: 580.88, x7: 586.86, x8: 592.85, x9: 598.83, x10: 604.81 },
    portaria: 0.00
  },
  {
    medida: '265/70/16',
    modelo: 'ADVENTURE ATR',
    categoria: 'pickup',
    aVista: 559.00,
    parcelado: { x1: 571.41, x2: 577.61, x3: 583.82, x4: 590.02, x5: 596.23, x6: 602.43, x7: 608.64, x8: 614.84, x9: 621.05, x10: 627.25 },
    portaria: 50.00
  },
  {
    medida: '265/70/16',
    modelo: 'ADVENTURE H/T',
    categoria: 'pickup',
    aVista: 549.00,
    parcelado: { x1: 561.19, x2: 567.28, x3: 573.38, x4: 579.47, x5: 585.56, x6: 591.66, x7: 597.75, x8: 603.85, x9: 609.94, x10: 616.03 },
    portaria: 50.00
  },
  {
    medida: '265/70/16',
    modelo: 'BRUTUS T/A',
    categoria: 'pickup',
    aVista: 699.00,
    parcelado: { x1: 714.52, x2: 722.28, x3: 730.04, x4: 737.79, x5: 745.55, x6: 753.31, x7: 761.07, x8: 768.83, x9: 776.59, x10: 784.35 },
    portaria: 50.00
  },
  {
    medida: '265/65/17',
    modelo: 'ADVENTURE ATR',
    categoria: 'pickup',
    aVista: 559.00,
    parcelado: { x1: 571.41, x2: 577.61, x3: 583.82, x4: 590.02, x5: 596.23, x6: 602.43, x7: 608.64, x8: 614.84, x9: 621.05, x10: 627.25 },
    portaria: 30.00
  },
  {
    medida: '265/65/17',
    modelo: 'ADVENTURE H/T',
    categoria: 'pickup',
    aVista: 549.00,
    parcelado: { x1: 561.19, x2: 567.28, x3: 573.38, x4: 579.47, x5: 585.56, x6: 591.66, x7: 597.75, x8: 603.85, x9: 609.94, x10: 616.03 },
    portaria: 30.00
  },
  {
    medida: '265/65/17',
    modelo: 'BRUTUS T/A',
    categoria: 'pickup',
    aVista: 599.00,
    parcelado: { x1: 612.30, x2: 618.95, x3: 625.60, x4: 632.24, x5: 638.89, x6: 645.54, x7: 652.19, x8: 658.84, x9: 665.49, x10: 672.14 },
    portaria: 30.00
  },
  {
    medida: '265/60/18',
    modelo: 'ADVENTURE H/T',
    categoria: 'pickup',
    aVista: 559.00,
    parcelado: { x1: 571.41, x2: 577.61, x3: 583.82, x4: 590.02, x5: 596.23, x6: 602.43, x7: 608.64, x8: 614.84, x9: 621.05, x10: 627.25 },
    portaria: 30.00
  },
  {
    medida: '265/60/18',
    modelo: 'ADVENTURE ATR',
    categoria: 'pickup',
    aVista: 549.00,
    parcelado: { x1: 561.19, x2: 567.28, x3: 573.38, x4: 579.47, x5: 585.56, x6: 591.66, x7: 597.75, x8: 603.85, x9: 609.94, x10: 616.03 },
    portaria: 30.00
  },
  {
    medida: '265/60/18',
    modelo: 'BRUTUS T/A',
    categoria: 'pickup',
    aVista: 599.00,
    parcelado: { x1: 612.30, x2: 618.95, x3: 625.60, x4: 632.24, x5: 638.89, x6: 645.54, x7: 652.19, x8: 658.84, x9: 665.49, x10: 672.14 },
    portaria: 30.00
  },
  {
    medida: 'Aro 13',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 110.00,
    parcelado: { x1: 112.44, x2: 113.66, x3: 114.88, x4: 116.11, x5: 117.33, x6: 118.55, x7: 119.77, x8: 120.99, x9: 122.21, x10: 123.43 },
    portaria: 2.00
  },
  {
    medida: 'Aro 14',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 114.00,
    parcelado: { x1: 116.53, x2: 117.80, x3: 119.06, x4: 120.33, x5: 121.59, x6: 122.86, x7: 124.12, x8: 125.39, x9: 126.65, x10: 127.92 },
    portaria: 2.00
  },
  {
    medida: 'Aro 15',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 117.00,
    parcelado: { x1: 119.60, x2: 120.90, x3: 122.19, x4: 123.49, x5: 124.79, x6: 126.09, x7: 127.39, x8: 128.69, x9: 129.99, x10: 131.29 },
    portaria: 2.00
  },
  {
    medida: 'Suv',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 150.00,
    parcelado: { x1: 153.33, x2: 155.00, x3: 156.66, x4: 158.33, x5: 159.99, x6: 161.66, x7: 163.32, x8: 164.99, x9: 166.65, x10: 168.32 },
    portaria: 3.00
  },
  {
    medida: 'Vans',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 150.00,
    parcelado: { x1: 153.33, x2: 155.00, x3: 156.66, x4: 158.33, x5: 159.99, x6: 161.66, x7: 163.32, x8: 164.99, x9: 166.65, x10: 168.32 },
    portaria: 3.00
  },
  {
    medida: 'Caminhonetes',
    modelo: 'Recape / Carcaça',
    categoria: 'recape',
    aVista: 150.00,
    parcelado: { x1: 153.55, x2: 155.00, x3: 156.66, x4: 158.33, x5: 170.66, x6: 172.43, x7: 174.21, x8: 175.98, x9: 177.76, x10: 179.54 },
    portaria: 4.00
  },
];

export function buscarPrecoPorMedida(textoBusca: string): ItemPreco[] {
  const norm = textoBusca.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!norm) return [];
  return TABELA_PRECOS_GP.filter((item) => {
    const itemNorm = item.medida.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return itemNorm.includes(norm) || norm.includes(itemNorm);
  });
}

function normalizarMedida(valor: string): string {
  return String(valor || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function encontrarPrecosExatosPorMedida(medida: string): ItemPreco[] {
  const alvo = normalizarMedida(medida);
  if (!alvo) return [];
  return TABELA_PRECOS_GP.filter((item) => normalizarMedida(item.medida) === alvo);
}

// Cliente escreve (e FALA, quando vira transcricao de audio) a medida de mil jeitos.
// Achado 01/09: "175/60-14" nao era reconhecido e o robo pedia a medida de novo ate
// o cliente desistir. Aqui a gente normaliza tudo pra um formato so antes de procurar.
// Cliente escreve (e FALA, quando vira transcricao de audio) a medida de mil jeitos.
// Achado 01/09: "175/60-14" nao era reconhecido e o robo pedia a medida de novo ate
// o cliente desistir. Aqui normalizamos tudo pra um formato so antes de procurar.
// ATENCAO A ORDEM: as expressoes COMPOSTAS ("sessenta e cinco") tem que ser trocadas
// ANTES das simples ("sessenta"), senao "sessenta e cinco" vira "60 e cinco".
function normalizarTextoMedida(texto: string): string {
  let t = String(texto || '').toUpperCase();
  const trocas: Array<[RegExp, string]> = [
    // centenas por extenso (primeiro as compostas)
    [/\bCENTO E SESSENTA E CINCO\b/g, '165'],
    [/\bCENTO E SETENTA E CINCO\b/g, '175'],
    [/\bCENTO E OITENTA E CINCO\b/g, '185'],
    [/\bCENTO E NOVENTA E CINCO\b/g, '195'],
    [/\bDUZENTOS E VINTE E CINCO\b/g, '225'],
    [/\bDUZENTOS E QUINZE\b/g, '215'],
    [/\bDUZENTOS E CINCO\b/g, '205'],
    // dezenas COMPOSTAS antes das simples
    [/\bCINQUENTA E CINCO\b/g, '55'],
    [/\bCINCOENTA E CINCO\b/g, '55'],
    [/\bSESSENTA E CINCO\b/g, '65'],
    [/\bSETENTA E CINCO\b/g, '75'],
    // dezenas simples
    [/\bCINQUENTA\b/g, '50'],
    [/\bCINCOENTA\b/g, '50'],
    [/\bSESSENTA\b/g, '60'],
    [/\bSETENTA\b/g, '70'],
    // aros por extenso
    [/\bTREZE\b/g, '13'],
    [/\bQUATORZE\b/g, '14'],
    [/\bCATORZE\b/g, '14'],
    [/\bQUINZE\b/g, '15'],
    [/\bDEZESSEIS\b/g, '16'],
    [/\bDEZESSETE\b/g, '17'],
    [/\bDEZOITO\b/g, '18'],
    // separadores falados viram barra
    [/\b(POR|BARRA|TRACO)\b/g, '/'],
  ];
  for (const [de, para] of trocas) t = t.replace(de, para);
  return t.replace(/\s+/g, ' ');
}

// Cliente manda medida pela METADE o tempo todo ("14/70", "aro 14 perfil 70", "70 14").
// Achado 01/09: nesses casos o robo so pedia a medida completa de novo, em vez de
// olhar a tabela e dizer "no aro 14 com perfil 70 a gente tem 175/70/14 e 185/70/14,
// qual bate com o seu?". Aqui achamos os candidatos reais da tabela.
// Cliente manda medida pela METADE o tempo todo, e de todo jeito:
//   "14/70"   -> aro + perfil, falta a largura
//   "175.70"  -> largura + perfil, falta o aro   (caso real 02/09)
//   "175 14"  -> largura + aro, falta o perfil
// Achado 01-02/09: em todos esses o robo so repetia "me manda a medida completa".
// Agora a gente cruza o pedaco com a tabela e ja oferece os candidatos reais.
export function medidasParciais(texto: string): string[] {
  const base = normalizarTextoMedida(texto);
  // Se ja da pra ler a medida inteira, isso aqui nao e necessario.
  if (extrairMedidasDoTexto(texto).length) return [];

  // Monta os valores validos a partir da propria tabela, pra nunca ficar defasado.
  const larguras = new Set<string>();
  const perfis = new Set<string>();
  const aros = new Set<string>();
  for (const item of TABELA_PRECOS_GP) {
    const p = String(item.medida || '').split('/');
    if (p.length !== 3) continue;
    larguras.add(p[0]!);
    perfis.add(p[1]!);
    aros.add(p[2]!);
  }

  const numeros = base.match(/\b\d{2,3}\b/g) || [];
  if (numeros.length < 2) return [];
  const temLargura = numeros.filter((n) => larguras.has(n));
  const temPerfil = numeros.filter((n) => perfis.has(n));
  const temAro = numeros.filter((n) => aros.has(n));

  // Precisa de pelo menos DUAS das tres partes pra valer a pena sugerir.
  const partesConhecidas = [temLargura.length > 0, temPerfil.length > 0, temAro.length > 0].filter(Boolean).length;
  if (partesConhecidas < 2) return [];

  const achadas = new Set<string>();
  for (const item of TABELA_PRECOS_GP) {
    const p = String(item.medida || '').split('/');
    if (p.length !== 3) continue;
    const bateLargura = !temLargura.length || temLargura.includes(p[0]!);
    const batePerfil = !temPerfil.length || temPerfil.includes(p[1]!);
    const bateAro = !temAro.length || temAro.includes(p[2]!);
    if (bateLargura && batePerfil && bateAro) achadas.add(item.medida);
  }
  // Se sobrou a tabela inteira, o palpite nao ajuda em nada.
  return achadas.size && achadas.size <= 8 ? [...achadas] : [];
}

export function extrairMedidasDoTexto(texto: string): string[] {
  const base = normalizarTextoMedida(texto);
  const achadas = new Set<string>();
  // Aceita: 175/60/14, 175/60-14, 175/60 14, 175/60 R14, 175/60 ARO 14,
  // 175 60 14, 175.60.14, 175,60,14, 175x60x14 — e as versoes vindas de audio.
  const regex = /\b(\d{3})\s*[\/\-\s.,X]\s*(\d{2})\s*[\/\-\s.,X]*\s*(?:R|ARO)?\s*(\d{2})\b/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(base))) {
    achadas.add(`${match[1]}/${match[2]}/${match[3]}`);
  }
  return [...achadas];
}

export function analisarConsultaPreco(texto: string): AnaliseConsultaPreco {
  const medidasDetectadas = extrairMedidasDoTexto(texto);
  const matchesExatos: MatchPreco[] = [];
  const ambiguas: MatchPreco[] = [];
  const semResultado: string[] = [];

  for (const medida of medidasDetectadas) {
    const itens = encontrarPrecosExatosPorMedida(medida);
    if (!itens.length) {
      semResultado.push(medida);
      continue;
    }
    const payload = { medidaConsultada: medida, itens };
    if (itens.length === 1) matchesExatos.push(payload);
    else ambiguas.push(payload);
  }

  return { medidasDetectadas, matchesExatos, ambiguas, semResultado };
}

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function detectarParcelaSolicitada(texto: string): number | null {
  const base = String(texto || '').toLowerCase();
  // Achado 27/08: antes exigia espaco ou fim-de-string logo apos o "x" (ex.: "10x "),
  // entao "10x?" ou "10x!" (pontuacao colada, super comum em WhatsApp) nao batia e a
  // parcela pedida nunca era detectada. Agora aceita qualquer coisa que NAO seja letra/numero
  // logo depois (ou fim da string).
  const match = /(?:^|\s)(10|[1-9])\s*x(?![a-z0-9])/.exec(base);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 10 ? n : null;
}

function detectarQuantidade(texto: string): number | null {
  const base = String(texto || '').toLowerCase();
  const comUnidade = /\b(\d{1,2})\s*(pneus?|unidades?|und\.?|jogo\s+de)\b/i.exec(base);
  if (comUnidade && comUnidade[1]) {
    const n = Number(comUnidade[1]);
    if (n >= 1 && n <= 8) return n;
  }
  const osN = /\bos\s+(\d{1,2})\b/i.exec(base);
  if (osN && osN[1]) {
    const n = Number(osN[1]);
    if (n >= 1 && n <= 8) return n;
  }
  return null;
}

function detectarPedidoDePreco(texto: string): boolean {
  const base = String(texto || '').toLowerCase();
  return [
    'preco', 'preço', 'valor', 'quanto', 'avista', 'à vista', 'pix', 'dinheiro',
    'parcela', 'parcelado', 'parcelamento', 'x sem juros', 'cotacao', 'cotação',
  ].some((token) => base.includes(token))
    // Achado 27/08: resposta so com "10x", "em 10x" etc (sem nenhuma das palavras acima)
    // tambem conta como pedido de preco — e um numero de parcela isolado so faz sentido
    // como resposta a "quantas vezes quer parcelar", tem que cair na conta garantida.
    || detectarParcelaSolicitada(base) !== null;
}

function detectarSaudacaoSemPedido(texto: string): boolean {
  const base = String(texto || '').trim().toLowerCase();
  return ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'].includes(base);
}

// Achado 01/09: a linha "pode conceder ate 10% de desconto" e ORIENTACAO INTERNA de
// venda e estava sendo mandada PRO CLIENTE junto com o preco. Nunca mais.
function resumoPromocional(item: ItemPreco): string[] {
  const linhas: string[] = [];
  if (item.promocao) linhas.push('Esse item esta em promocao.');
  if (item.compre3Leve4) linhas.push('Esse pneu esta na campanha COMPRE 3 E LEVE 4 — levando 4, voce paga so 3.');
  return linhas;
}

// Quantas unidades o cliente REALMENTE paga. Na campanha "compre 3 e leve 4", a cada
// 4 pneus um sai de graca. Achado 01/09: o sistema cobrava 4x328,90 = R$1.315,60 num
// item da campanha, quando o certo era 3x328,90 = R$986,70 — R$328,90 a mais no
// bolso do cliente, num preco que o robo manda sozinho no WhatsApp.
function unidadesCobradas(item: ItemPreco, quantidade: number): number {
  if (!item.compre3Leve4 || quantidade < 4) return quantidade;
  return quantidade - Math.floor(quantidade / 4);
}

function linhaParcelamento(item: ItemPreco, parcelaSolicitada: number | null): string {
  if (parcelaSolicitada) {
    const chave = `x${parcelaSolicitada}` as keyof ItemPreco['parcelado'];
    return `${parcelaSolicitada}x de R$ ${brl(item.parcelado[chave])}`;
  }
  return `1x R$ ${brl(item.parcelado.x1)} | 2x R$ ${brl(item.parcelado.x2)} | 3x R$ ${brl(item.parcelado.x3)} | 4x R$ ${brl(item.parcelado.x4)} | 5x R$ ${brl(item.parcelado.x5)} | 6x R$ ${brl(item.parcelado.x6)} | 7x R$ ${brl(item.parcelado.x7)} | 8x R$ ${brl(item.parcelado.x8)} | 9x R$ ${brl(item.parcelado.x9)} | 10x R$ ${brl(item.parcelado.x10)}`;
}

function primeiroModelo(modelo: string): string {
  // Separa em ' / ' COM espacos: varios modelos tem barra no proprio nome
  // (ADVENTURE A/T, BRUTUS T/A, ADVENTURE H/T). Cortando em qualquer '/', o robo
  // dizia 'ADVENTURE A' pro cliente — nome de produto que nao existe (achado 02/09).
  const partes = modelo.split(' / ');
  return (partes[0] ?? modelo).trim();
}

// Preco se revela em ETAPAS (achado 25/08): sem numero de parcela pedido, so mostra
// a vista + 1 modelo (nunca a tabela inteira de 1x-10x junto). So quando o cliente
// pede uma parcela especifica (ex.: "10x") que mostra o valor daquela parcela — e o
// desconto a vista vem numa PARTE SEPARADA, nunca colado no mesmo bloco.
function montarPartesPreco(item: ItemPreco, parcelaSolicitada: number | null, quantidade: number | null): string[] {
  const modeloUnico = primeiroModelo(item.modelo);
  const qtd = quantidade && quantidade > 1 ? quantidade : 1;
  const prefixoQtd = qtd > 1 ? `${qtd} unidades ` : '';
  // Na campanha "compre 3 e leve 4" o cliente leva 4 e paga 3 (achado 01/09: o robo
  // estava cobrando as 4 unidades, R$328,90 a mais num pedido de 195/65/15).
  const cobradas = unidadesCobradas(item, qtd);
  const avisoLeve4 = cobradas < qtd
    ? `Voce leva ${qtd} e paga so ${cobradas} (campanha compre 3 e leve 4).`
    : '';
  if (!parcelaSolicitada) {
    const linhas = [
      `${item.medida} - ${modeloUnico}`,
      `${prefixoQtd}A vista: R$ ${brl(item.aVista * cobradas)}`,
      ...(avisoLeve4 ? [avisoLeve4] : []),
      'Parcelamos em ate 10x.',
      ...resumoPromocional(item),
    ];
    return [linhas.join('\n')];
  }
  // Achado 27/08: item.parcelado[x_N] ja e o TOTAL pra financiar em N vezes (nao o
  // valor de cada parcela) — confirmado pelo padrao da tabela inteira: os valores
  // sobem aos poucos conforme N cresce (x1=244,31 ... x10=268,18 pro GP-7 165/70/14),
  // exatamente como um financiamento de verdade (mais parcelas = mais juros total).
  // O codigo antigo tratava x_N como "valor de cada parcela" e multiplicava de novo
  // por N, inflando o total em ate 6x (ex.: 1 pneu de R$239 virava R$1.545 em 6x).
  const chave = `x${parcelaSolicitada}` as keyof ItemPreco['parcelado'];
  const total = item.parcelado[chave] * cobradas;
  const valorParcela = total / parcelaSolicitada;
  const parte1 = [
    `${item.medida} - ${modeloUnico}${qtd > 1 ? ` (${qtd} unidades)` : ''}`,
    `Em ${parcelaSolicitada}x fica R$ ${brl(valorParcela)} cada, total de R$ ${brl(total)}.`,
  ].join('\n');
  const parte2 = 'Pagamento a vista no PIX ou dinheiro permite trabalhar 5% de desconto para fechamento imediato.';
  return [parte1, parte2];
}

export function resumirItemPreco(item: ItemPreco): string {
  const flags = [
    item.promocao ? 'PROMOCAO' : '',
    item.compre3Leve4 ? 'COMPRE_3_LEVE_4' : '',
  ].filter(Boolean);
  // Cada XN e o TOTAL pra financiar em N vezes (nao o valor de cada parcela) —
  // deixado explicito aqui pra IA nunca multiplicar de novo por N (achado 27/08).
  const parcelas = Object.entries(item.parcelado)
    .map(([chave, valor]) => `${chave.toUpperCase()}_TOTAL=R$ ${brl(Number(valor))} (cada parcela = total/${chave.replace('x', '')})`)
    .join(' | ');
  return [
    `${item.medida} :: ${item.modelo}`,
    `A_VISTA=R$ ${brl(item.aVista)}`,
    `A_VISTA_PIX_5PCT=R$ ${brl(Math.round(item.aVista * 0.95 * 100) / 100)} (a vista no PIX/dinheiro, ja com os 5% de desconto)`,
    parcelas,
    flags.length ? `FLAGS=${flags.join(',')}` : '',
  ].filter(Boolean).join(' :: ');
}

// O robo precisa SEMPRE saber o que a loja tem — nao so quando a medida bate.
// Antes, numa conversa sem match ele nao recebia nada do catalogo e chutava de
// memoria (chegou a oferecer aro 13 pra cliente de aro 14). Agora vai junto, em
// toda resposta, a lista completa agrupada por ARO — compacta, so as medidas.
// O robo precisa SEMPRE saber o que a loja tem — nao so quando a medida bate.
// Inclui tambem os RECAPES (achado 01/09: 6 itens de recape, bem mais baratos que o
// pneu novo — R$110 no aro 13 contra R$239 —, eram INVISIVEIS pro robo porque o nome
// deles ("Aro 13", "Suv", "Vans"...) nao tem formato de medida. Cliente que achava
// caro ia embora sem nunca ouvir a opcao mais barata da loja).
// O robo precisa SEMPRE saber o que a loja tem — nao so quando a medida bate.
// Inclui tambem os RECAPES (achado 01/09: 6 itens de recape, bem mais baratos que o
// pneu novo — R$110 no aro 13 contra R$239 —, eram INVISIVEIS pro robo porque o nome
// deles ("Aro 13", "Suv", "Vans"...) nao tem formato de medida. Cliente que achava
// caro ia embora sem nunca ouvir a opcao mais barata da loja).
function catalogoPorAro(): string {
  const porAro = new Map<string, string[]>();
  const recapes: string[] = [];
  for (const item of TABELA_PRECOS_GP) {
    const partes = String(item.medida || '').split('/');
    if (partes.length !== 3) {
      if (String(item.categoria || '') === 'recape') recapes.push(`${item.medida}: R$ ${brl(item.aVista)} a vista`);
      continue;
    }
    const aro = partes[2];
    if (!aro) continue;
    if (!porAro.has(aro)) porAro.set(aro, []);
    const lista = porAro.get(aro)!;
    if (!lista.includes(item.medida)) lista.push(item.medida);
  }
  const aros = [...porAro.keys()].sort((a, b) => Number(a) - Number(b));
  const linhasAro = aros.map((aro) => `  aro ${aro}: ${porAro.get(aro)!.join(', ')}`);
  const blocos: string[] = [
    'CATALOGO_COMPLETO_DA_LOJA (medidas de pneu NOVO que a loja vende, por ARO — use pra saber o que temos e oferecer SO o que serve na roda do cliente):',
    linhasAro.join('\n'),
  ];
  if (recapes.length) {
    blocos.push('RECAPE_DISPONIVEL (pneu recapado — BEM mais barato que o novo. Ofereca quando o cliente reclamar do preco, disser que esta caro ou pedir a opcao mais em conta. Deixe claro que e recape, nunca venda como novo):');
    blocos.push(recapes.map((r) => '  ' + r).join('\n'));
  }
  return blocos.join('\n');
}

export function montarBriefingComercialDeterministico(texto: string): string {
  const analise = analisarConsultaPreco(texto);
  if (!analise.medidasDetectadas.length) {
    // Achado 01/09: cliente mandou "14/70" (aro + perfil, sem a largura). O robo so
    // pedia a medida completa de novo. Agora a gente procura na tabela o que casa com
    // esse pedaco e ja oferece os candidatos reais, em vez de empurrar a pergunta.
    const parciais = medidasParciais(texto);
    const base = [
      'CONTEXTO_COMERCIAL_LOCAL:',
      'Nenhuma medida completa detectada na ultima mensagem.',
    ];
    if (parciais.length) {
      base.push(`MEDIDA_INCOMPLETA — o cliente deu so um pedaco da medida. Na nossa tabela, o que casa com esse pedaco e: ${parciais.join(', ')}. Ofereca ESTAS opcoes e peca pra ele confirmar qual bate com o pneu dele, em vez de so pedir a medida completa de novo.`);
    } else {
      base.push('Se o cliente pedir preco sem medida, peca a medida exata do pneu antes de cotar.');
    }
    base.push(catalogoPorAro());
    return base.join('\n');
  }

  const linhas: string[] = ['CONTEXTO_COMERCIAL_LOCAL:'];

  if (analise.matchesExatos.length) {
    linhas.push('MEDIDAS_COM_COTACAO_SEGURA:');
    for (const match of analise.matchesExatos) {
      linhas.push(`- ${match.medidaConsultada}`);
      for (const item of match.itens) linhas.push(`  - ${resumirItemPreco(item)}`);
    }
  }

  if (analise.ambiguas.length) {
    linhas.push('MEDIDAS_AMBIGUAS_NAO_COTAR_ANTES_DE_CONFIRMAR_MODELO:');
    for (const match of analise.ambiguas) {
      linhas.push(`- ${match.medidaConsultada}`);
      for (const item of match.itens) linhas.push(`  - ${resumirItemPreco(item)}`);
    }
  }

  if (analise.semResultado.length) {
    linhas.push(`SEM_RESULTADO_LOCAL: ${analise.semResultado.join(', ')}`);

    // Achado 01/09 (conversa real perdida): quando a medida exata nao existia, o robo
    // recebia SO o "SEM_RESULTADO_LOCAL" e ficava sem saber o que a loja tem no MESMO
    // ARO. Resultado: disse "a gente nao tem" pra um cliente de aro 14 e ainda ofereceu
    // 165/70/13 (aro 13, que nao entra na roda dele) — sendo que a tabela tem SEIS
    // medidas de aro 14. Agora mandamos junto as opcoes reais do mesmo aro, com preco.
    for (const medidaSemMatch of analise.semResultado) {
      const partesPedida = String(medidaSemMatch).split('/');
      const larguraPedida = partesPedida[0];
      const aro = partesPedida[2];
      if (!aro) continue;

      const mesmoAro = TABELA_PRECOS_GP.filter((item) => {
        const p = String(item.medida || '').split('/');
        return p.length === 3 && p[2] === aro;
      });
      if (!mesmoAro.length) {
        linhas.push(`- Nao existe NENHUMA medida de aro ${aro} na tabela: seja honesto e diga que pra roda dele a loja nao tem opcao.`);
        continue;
      }

      // Achado 01/09: o cliente pediu 175/60/14 e o robo ofereceu SO a 175/65/14,
      // deixando de fora a 175/70/14 — que tambem e 175 de largura no aro 14 e serve
      // igual. Aqui separamos os EQUIVALENTES DIRETOS (mesma largura + mesmo aro, so
      // muda o perfil) das demais opcoes do mesmo aro, pra ele oferecer todas as que
      // realmente servem.
      const equivalentes = mesmoAro.filter((item) => String(item.medida).split('/')[0] === larguraPedida);
      const outrasDoAro = mesmoAro.filter((item) => String(item.medida).split('/')[0] !== larguraPedida);

      if (equivalentes.length) {
        linhas.push(`EQUIVALENTES_DIRETOS_DE_${medidaSemMatch} (mesma largura ${larguraPedida} e mesmo aro ${aro} — so muda o perfil, serve no carro dele: OFERECA TODAS ESTAS):`);
        for (const item of equivalentes) linhas.push(`  - ${resumirItemPreco(item)}`);
      }
      if (outrasDoAro.length) {
        linhas.push(`OUTRAS_DO_ARO_${aro} (entram na roda dele, mas com largura diferente — ofereca so se nao houver equivalente direto ou se ele pedir mais opcoes):`);
        for (const item of outrasDoAro) linhas.push(`  - ${resumirItemPreco(item)}`);
      }
    }
  }

  linhas.push(catalogoPorAro());
  linhas.push('REGRAS_LOCAIS_OBRIGATORIAS:');
  linhas.push('- Nunca inventar preco, parcela, promocao ou modelo fora desta base.');
  linhas.push('- Se houver mais de um modelo para a mesma medida, perguntar qual modelo ou uso do cliente antes de passar preco.');
  linhas.push('- Ignorar completamente portaria.');
  return linhas.join('\n');
}

export function montarRespostaDeterministicaPreco(texto: string, textoGatilho?: string): RespostaDeterministicaPreco | null {
  if (!texto || detectarSaudacaoSemPedido(texto)) return null;
  const analise = analisarConsultaPreco(texto);
  const parcelaSolicitada = detectarParcelaSolicitada(texto);
  const quantidade = detectarQuantidade(texto);
  // O GATILHO (decidir SE e pedido de preco) usa so a mensagem ATUAL do cliente (textoGatilho),
  // nunca a janela de varias mensagens — senao uma medida mencionada 2-3 mensagens atras
  // "contamina" qualquer pergunta seguinte sem relacao (achado 26/08: cliente perguntou
  // "e remold?" e o robo respondeu preco de novo, porque a janela ainda continha a medida
  // de uma pergunta anterior). So mencionar medida/carro tambem nao conta como pedido de
  // preco (achado 25/08) — isso cai na IA, que confirma medida/modelo sem jogar preco de cara.
  const gatilho = textoGatilho ?? texto;
  const pediuPreco = detectarPedidoDePreco(gatilho);

  if (!pediuPreco) return null;

  if (analise.ambiguas.length) {
    const linhas = ['Pra eu te passar o valor certinho sem risco de erro, preciso confirmar o modelo/uso dessas medidas:'];
    for (const match of analise.ambiguas) {
      linhas.push(`- ${match.medidaConsultada}: ${match.itens.map((item) => item.modelo).join(' | ')}`);
    }
    linhas.push('Se preferir, me fala o carro, uso do pneu ou o modelo desejado que eu te passo a cotacao certa.');
    return { partes: [linhas.join('\n')], usouTabela: true };
  }

  if (analise.matchesExatos.length) {
    const partes: string[] = [];
    for (const match of analise.matchesExatos) {
      for (const item of match.itens) partes.push(...montarPartesPreco(item, parcelaSolicitada, quantidade));
    }
    return { partes, usouTabela: true };
  }

  if (analise.semResultado.length) {
    return {
      partes: [`Nao encontrei na tabela oficial a medida ${analise.semResultado.join(', ')}. Se quiser, me manda a medida exatamente como esta no pneu que eu confiro certinho pra voce.`],
      usouTabela: true,
    };
  }

  return null;
}
