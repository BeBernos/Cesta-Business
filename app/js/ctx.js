// Estado compartilhado entre as telas (preenchido por app.js).
export const app = {
  loja: null,
  sinc: null,
  mes: null,
  aba: 'precos',
  prefs: {},
  render: () => {},
  salvarPrefs: () => {},
  irMes: () => {},
  irAba: () => {},
  copiaSeguranca: async () => {},
  seloSinc: () => document.createElement('span'),
  abrirMeses: () => {},
};
