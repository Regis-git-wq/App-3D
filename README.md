# Reforma 3D

App para iPhone (web app instalável, PWA) para **mapear um apartamento** e **simular a reforma** em 2D, 3D e realidade aumentada.

Funciona no Safari do iPhone 16 sem precisar de Mac, Xcode, conta de desenvolvedor Apple ou sensor LiDAR.

## O que ele faz

- **Mapear com a câmera**: coloque uma folha A4 no chão, fotografe o cômodo e toque nos cantos do chão e no alto das quinas. O app estima a inclinação da câmera (usando a folha, os cantos retos e as quinas verticais) e calcula a planta em metros. Em testes com fotos sintéticas o erro fica em torno de 1–3% por parede; informando uma medida de trena, a escala fica exata. Vários cômodos mapeados se unem ao serem arrastados até encostar.
- **Planta 2D com o dedo**: crie cômodos retangulares pelas medidas ou trace parede por parede (digite a medida em cm e escolha a direção ↑ ← → ↓). Encaixe automático em cantos, paredes e ângulos retos. Pinça para zoom, arraste para mover.
- **Portas, janelas e vãos** com largura, altura, peitoril e lado de abertura.
- **Cômodos detectados automaticamente**: ao desenhar uma parede interna o cômodo se divide; ao marcar uma parede como *Demolir* os cômodos se unem.
- **Cenários**: mantenha o "Atual (antes)" e crie versões da reforma (Reforma A, B…). Paredes podem ser *Existente*, *Demolir* (vermelho) ou *Construir* (verde).
- **Acabamentos por cômodo**: pisos (porcelanato, madeira, vinílico, mármore, cimento queimado, ladrilho hidráulico…), pintura (paleta ou cor livre) ou revestimento de parede (azulejo, metrô, tijolinho, ripado…).
- **Móveis e equipamentos** em tamanho real (sofás, camas, guarda-roupa, bancadas, geladeira, vaso, box…), com cor, giro e medidas editáveis.
- **3D**: maquete para girar e aproximar, modo **Caminhar** (primeira pessoa com joystick) e botão para ver as demolições.
- **Realidade aumentada**: gera um arquivo `.usdz` e abre no **AR Quick Look** do iPhone, em escala 1:1.
- **Quantitativos para orçamento**: m² de piso por material, m² de pintura por cor, revestimento, demolição e paredes novas (descontando portas e janelas), além da comparação entre cenários.
- Salva automaticamente no aparelho, funciona offline e exporta/importa o projeto em `.json`.

## Como medir o apartamento sem LiDAR

O iPhone 16 (não Pro) não tem LiDAR, então o escaneamento automático (RoomPlan da Apple) não está disponível, e o Safari não dá acesso ao rastreamento AR da câmera. Por isso o app mapeia **por foto** (botão **Câmera**), usando uma folha A4 no chão como régua. Para conferir ou corrigir:

1. Use uma **trena** (ou trena a laser) para as paredes. O app **Medida**, que já vem no iPhone, serve para conferir, mas erra alguns centímetros.
2. Anote, para cada cômodo: comprimento de cada parede, posição e largura de portas/janelas (distância do canto), altura do peitoril das janelas e o pé-direito.
3. No app, comece por um cômodo e vá encostando os outros. Cantos e paredes coincidentes se unem sozinhos.

## Como instalar no iPhone

O app é um site estático, então só precisa ser hospedado em HTTPS. Opção gratuita com o próprio GitHub:

1. No GitHub, abra o repositório → **Settings** → **Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, selecione o branch com o código e a pasta `/ (root)`, e salve.
3. Depois de 1–2 minutos aparece o endereço (algo como `https://SEU-USUARIO.github.io/App-3D/`).
4. Abra esse endereço no **Safari** do iPhone → botão **Compartilhar** → **Adicionar à Tela de Início**.

> O GitHub Pages é gratuito para repositórios **públicos**. Para repositório privado é preciso um plano pago. Nesse caso dá para usar o Netlify ou o Cloudflare Pages (gratuitos): basta enviar a pasta do projeto.

Para testar no computador: `python3 -m http.server 8000` na pasta do projeto e abrir `http://localhost:8000`.

## Estrutura

```
index.html              interface
css/app.css             estilos (mobile first)
js/app.js               controlador: ferramentas, painéis, cenários, salvar/abrir
js/model.js             dados da planta, geometria e detecção de cômodos
js/plan2d.js            editor 2D em canvas (toque, pinça, encaixes)
js/view3d.js            3D com three.js, modo caminhar e exportação USDZ
js/photomap.js          mapeamento por foto (modelo de câmera + folha de referência)
js/catalog.js           pisos, revestimentos, cores e móveis (texturas geradas no código)
js/quantities.js        quantitativos para orçamento
sw.js, manifest.webmanifest, icons/   PWA (instalação e uso offline)
vendor/three/           three.js r169 (licença MIT)
```

## Próximos passos possíveis

- Versão nativa (Swift/ARKit) para medir paredes apontando a câmera, quando houver um Mac disponível.
- Fotos de referência por parede e anotações de obra.
- Tabela de preços por material para estimar custo total.
