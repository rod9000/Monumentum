/* Parâmetros gerais do jogo (ajustáveis em tempo de execução pelos testes). */
export const CONFIG = {
  duracaoPasso: 0.26,            // segundos por passo do personagem
  alturaPulo: 0.16,              // altura do "pulinho" ao andar
  suavizacaoGiro: 7,             // maior = giro mais rápido
  margemCamera: 1.22,            // folga ao enquadrar o diorama
  permitirCliqueDistante: true,  // false = só anda em bloco adjacente (regra estrita)
  concluirAposTodasAsMoedas: true,
  usarAlertaNativo: false,       // true = usa alert() do navegador
  personagemEncaraACamera: false,// false = mantém a direção do último passo
  zoom: 1,                       // 1 = diorama inteiro na tela
  zoomMin: 0.45,                 // afastar (mapas grandes)
  zoomMax: 3,                    // aproximar
  mostrarBordas: true,           // contorno em cada bloco (visual de "tile")
  sementeFixa: null,             // número = sorteio de moedas reproduzível;
                                 // null = moedas em lugares novos a cada partida
  velocidadeElevador: 1.15,      // células por segundo do elevador
  esperaElevador: 1.1,           // segundos parado em cada ponta (tempo de embarcar)
  alturaSalto: 0.9,              // altura do arco do pulo (marcador de pulo)
  pontesSempreAtivas: false,     // true = ignora o alinhamento da câmera (só para testes de fluxo)
  diarioRecompensa: 5            // moedas do desafio do dia (pagas uma vez por dia)
};
