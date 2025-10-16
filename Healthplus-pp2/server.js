const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

const uri = 'mongodb+srv://samuka:bananza@medicamentos.kdgfcmm.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(uri);

let db, usuariosCollection, medicamentosCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB Atlas');

    db = client.db('healthplus');
    usuariosCollection = db.collection('usuarios');
    medicamentosCollection = db.collection('medicamentos');
  } catch (error) {
    console.error('❌ Erro ao conectar com MongoDB:', error.message);
    process.exit(1);
  }
}

// Configurações do Express
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

// ---------------- Rotas principais ----------------
app.get('/', (req, res) => res.render('index'));
app.get('/entregas', (req, res) => res.render('entregas'));
app.get('/categorias', (req, res) => res.render('categorias'));
app.get('/criar-conta', (req, res) => res.render('criar-conta'));
app.get('/login', (req, res) => res.render('login'));

// ---------------- Cadastro/Login ----------------
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

// ---------------- Busca ----------------
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

// ---------------- Carrinho ----------------
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

// ---------------- Adicionar ao carrinho ----------------
app.post('/carrinho/adicionar', async (req, res) => {
  const { medicamentoId, nome, preco } = req.body;
  if (!req.session.usuario) return res.status(401).send('Faça login primeiro');

  try {
    const userId = new ObjectId(req.session.usuario._id);
    const usuario = await usuariosCollection.findOne({ _id: userId });

    const itemExistente = usuario.carrinho?.find(item => item.medicamentoId === medicamentoId);
    if (itemExistente) {
      await usuariosCollection.updateOne(
        { _id: userId, 'carrinho.medicamentoId': medicamentoId },
        { $inc: { 'carrinho.$.quantidade': 1 } }
      );
    } else {
      const novoItem = { medicamentoId, nome, preco: parseFloat(preco), quantidade: 1 };
      await usuariosCollection.updateOne(
        { _id: userId },
        { $push: { carrinho: novoItem } }
      );
    }

    const usuarioAtualizado = await usuariosCollection.findOne({ _id: userId });
    req.session.usuario.carrinho = usuarioAtualizado.carrinho;

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ---------------- Remover do carrinho (decrementa 1 unidade) ----------------
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

    const usuarioAtualizado = await usuariosCollection.findOne({ _id: userId });
    req.session.usuario.carrinho = usuarioAtualizado.carrinho;

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ---------------- Iniciar servidor ----------------
connectDB().then(() => {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
});