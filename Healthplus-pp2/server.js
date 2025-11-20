const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const finalizadoRoutes = require('./routers/finalizado');

const app = express();

const uri = 'mongodb+srv://samuka:bananza@medicamentos.kdgfcmm.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(uri);

let db, usuariosCollection, medicamentosCollection, entregadoresCollection, entregasCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log('Conectado ao MongoDB Atlas');

    db = client.db('healthplus');
    usuariosCollection = db.collection('usuarios');
    medicamentosCollection = db.collection('medicamentos');
    entregadoresCollection = db.collection('entregadores');
    entregasCollection = db.collection('entregas');
  } catch (error) {
    console.error('Erro ao conectar com MongoDB:', error.message);
    process.exit(1);
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'chave-secreta-healthplus',
  resave: false,
  saveUninitialized: true
}));

app.use((req, res, next) => {
  res.locals.user = req.session.usuario || null;
  next();
});

app.get('/', (req, res) => res.render('index'));

// ==================== LISTAR ENTREGAS ATIVAS ====================
app.get('/entregas', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  try {
    const userId = new ObjectId(req.session.usuario._id);

    // pegar apenas entregas não concluídas
    const raw = await entregasCollection.find({
      userId,
      status: { $ne: 'entregue' }
    })
    .sort({ criadoEm: -1 })
    .toArray();

    const entregas = raw.map(e => ({
      _id: e._id.toString(),                 // ← AGORA O FRONT PEGA CERTO
      pedido: e.pedido,
      entregador: e.entregador,
      status: e.status,
      etaMinutes: Number(e.etaMinutes),      // ← CONVERTE PARA NÚMERO!
      criadoEm: e.criadoEm,
      coords: e.coords || null,
      completedAt: e.completedAt || null
    }));

    res.render('entregas', { entregas });

  } catch (err) {
    console.error('Erro ao buscar entregas:', err);
    res.status(500).send('Erro ao carregar entregas');
  }
});


// ==================== FINALIZAR ENTREGA ====================
app.post('/entregas/finalizar/:id', async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);

    await entregasCollection.updateOne(
      { _id: id },
      {
        $set: {
          status: 'entregue',
          completedAt: new Date()
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao finalizar entrega:', err);
    res.sendStatus(500);
  }
});

app.get('/categorias', (req, res) => res.render('categorias'));
app.get('/criar-conta', (req, res) => res.render('criar-conta'));
app.get('/login', (req, res) => res.render('login'));

// ==================== CRIAR CONTA ====================
app.post('/criar-conta', async (req, res) => {
  const { nome, email, senha, confirmar } = req.body;
  if (senha !== confirmar) return res.send('As senhas não conferem!');

  try {
    const existente = await usuariosCollection.findOne({ email });
    if (existente) return res.send('Usuário já existe!');

    const novoUsuario = { nome, email, senha, carrinho: [], historico: [] };
    const resultado = await usuariosCollection.insertOne(novoUsuario);

    req.session.usuario = { _id: resultado.insertedId.toString(), nome, email, carrinho: [] };
    res.redirect('/');
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).send('Erro interno');
  }
});

// ==================== LOGIN ====================
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const user = await usuariosCollection.findOne({ email, senha });
    if (!user) return res.send('Credenciais inválidas');

    req.session.usuario = {
      _id: user._id.toString(),
      nome: user.nome,
      email: user.email,
      carrinho: user.carrinho || []
    };
    res.redirect('/');
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).send('Erro interno');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ==================== BUSCA ====================
app.get('/resultado-busca', async (req, res) => {
  const termo = req.query.termo || '';
  if (!termo) return res.render('resultado-busca', { medicamentos: [], termo, carrinho: [] });

  try {
    const regex = new RegExp(termo, 'i');
    const medicamentos = await medicamentosCollection.find({ nome: regex }).toArray();
    const carrinho = req.session.usuario?.carrinho || [];
    res.render('resultado-busca', { medicamentos, termo, carrinho });
  } catch (err) {
    console.error('Erro na busca:', err);
    res.status(500).send('Erro ao buscar medicamentos');
  }
});

app.get('/pagamento', (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  const carrinho = req.session.usuario.carrinho || [];
  const total = carrinho.reduce((acc, item) => acc + item.preco * item.quantidade, 0);

  res.render('pagamento', {
    carrinho,
    total,
    usuario: req.session.usuario
  });
});

// ==================== CONTAGEM DO CARRINHO ====================
app.get('/carrinho/count', async (req, res) => {
  if (!req.session.usuario) return res.json({ count: 0 });
  try {
    const user = await usuariosCollection.findOne({ _id: new ObjectId(req.session.usuario._id) });
    const count = user.carrinho?.reduce((acc, item) => acc + item.quantidade, 0) || 0;
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ count: 0 });
  }
});

// ==================== CARRINHO ====================
app.get('/carrinho', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  try {
    const user = await usuariosCollection.findOne({ _id: new ObjectId(req.session.usuario._id) });
    const carrinho = user.carrinho || [];
    const total = carrinho.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
    res.render('carrinho', { carrinho, total });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao carregar carrinho');
  }
});

// ==================== ADICIONAR AO CARRINHO ====================
app.post('/carrinho/adicionar', async (req, res) => {
  const { medicamentoId, nome, preco } = req.body;
  if (!req.session.usuario) return res.status(401).send('Faça login primeiro');

  try {
    const userId = new ObjectId(req.session.usuario._id);
    const usuario = await usuariosCollection.findOne({ _id: userId });

    const existente = usuario.carrinho?.find(i => i.medicamentoId === medicamentoId);

    if (existente) {
      await usuariosCollection.updateOne(
        { _id: userId, 'carrinho.medicamentoId': medicamentoId },
        { $inc: { 'carrinho.$.quantidade': 1 } }
      );
    } else {
      await usuariosCollection.updateOne(
        { _id: userId },
        {
          $push: {
            carrinho: {
              medicamentoId,
              nome,
              preco: parseFloat(preco),
              quantidade: 1
            }
          }
        }
      );
    }

    const atualizado = await usuariosCollection.findOne({ _id: userId });
    req.session.usuario.carrinho = atualizado.carrinho;
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ==================== REMOVER DO CARRINHO ====================
app.post('/carrinho/remover', async (req, res) => {
  const { medicamentoId } = req.body;
  if (!req.session.usuario) return res.status(401).send('Faça login primeiro');

  try {
    const userId = new ObjectId(req.session.usuario._id);
    const usuario = await usuariosCollection.findOne({ _id: userId });

    // procura o item correto, convertendo ids para string
    const item = usuario.carrinho.find(i => i.medicamentoId.toString() === medicamentoId.toString());
    if (!item) return res.sendStatus(404);

    if (item.quantidade > 1) {
      await usuariosCollection.updateOne(
        { _id: userId, 'carrinho.medicamentoId': item.medicamentoId },
        { $inc: { 'carrinho.$.quantidade': -1 } }
      );
    } else {
      await usuariosCollection.updateOne(
        { _id: userId },
        { $pull: { carrinho: { medicamentoId: item.medicamentoId } } }
      );
    }

   const atualizado = await usuariosCollection.findOne({ _id: userId });
    req.session.usuario.carrinho = atualizado.carrinho;
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ==================== PROCESSAR PAGAMENTO ====================
app.post('/pagamento/processar', async (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');

  try {
    const userId = new ObjectId(req.session.usuario._id);

    // Carrinho
    const carrinho = req.session.usuario.carrinho || [];
    if (carrinho.length === 0) {
      return res.send("Carrinho vazio. Nada para pagar.");
    }

    const entregadores = await entregadoresCollection.find().toArray();
    const entregadorBruto = entregadores.length > 0
      ? entregadores[Math.floor(Math.random() * entregadores.length)]
      : { nome: "Entregador Padrão", veiculo: "Moto" };

  
    const entregador = {
      nome: entregadorBruto.nome || entregadorBruto.Nome || "—",
      veiculo: entregadorBruto.veiculo || entregadorBruto.Veiculo || "—"
    };

    const eta = Math.floor(Math.random() * 15) + 5;

    await entregasCollection.insertOne({
      userId,
      pedido: carrinho,
      entregador,
      status: "a_caminho",
      etaMinutes: eta,
      criadoEm: new Date()
    });

    await usuariosCollection.updateOne(
      { _id: userId },
      { $set: { carrinho: [] } }
    );

    req.session.usuario.carrinho = [];

    res.redirect('/entregas');

  } catch (err) {
    console.error("Erro ao processar pagamento:", err);
    res.status(500).send("Erro ao processar pagamento.");
  }
});



// ==================== ROTAS DE FINALIZADO ====================
app.use('/', finalizadoRoutes);

// ==================== INICIAR SERVIDOR ====================
connectDB().then(() => {
  const port = 3000;
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
});
