const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();

const uri = 'mongodb+srv://samuka:bananza@medicamentos.kdgfcmm.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(uri);

let db, usuariosCollection, medicamentosCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB Atlas');

    db = client.db('healthplus'); // banco correto
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

app.use(session({
  secret: 'chave-secreta-healthplus',
  resave: false,
  saveUninitialized: true
}));

// Middleware para disponibilizar o usuário logado nas views
app.use((req, res, next) => {
  res.locals.user = req.session.usuario || null;
  next();
});

// Rotas principais
app.get('/', (req, res) => res.render('index'));

app.get('/entregas', (req, res) => res.render('entregas'));
app.get('/categorias', (req, res) => res.render('categorias'));
app.get('/criar-conta', (req, res) => res.render('criar-conta'));
app.get('/login', (req, res) => res.render('login'));

// Cadastro de usuário
app.post('/criar-conta', async (req, res) => {
  const { nome, email, senha, confirmar } = req.body;

  if (senha !== confirmar) {
    return res.send('As senhas não conferem!');
  }

  try {
    const existente = await usuariosCollection.findOne({ email });
    if (existente) return res.send('Usuário já existe!');

    const novoUsuario = { nome, email, senha };
    const resultado = await usuariosCollection.insertOne(novoUsuario);

    req.session.usuario = { _id: resultado.insertedId, nome, email };
    res.redirect('/');
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).send('Erro interno');
  }
});

// Login de usuário
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const user = await usuariosCollection.findOne({ email, senha });
    if (!user) return res.send('Credenciais inválidas');

    req.session.usuario = { _id: user._id, nome: user.nome, email: user.email };
    res.redirect('/');
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).send('Erro interno');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/categorias/:nome', (req, res) => {
  const nomeCategoria = req.params.nome;

  // Simulação de medicamentos por categoria
  const medicamentosFakes = {
    'Analgésicos': ['Paracetamol', 'Dipirona', 'Ibuprofeno'],
    'Antibióticos': ['Amoxicilina', 'Azitromicina', 'Cefalexina'],
    'Vitaminas': ['Vitamina C', 'Vitamina D', 'Multivitamínico'],
    // ... outras categorias
  };

  const medicamentos = medicamentosFakes[nomeCategoria] || [];

  res.render('categoria-detalhe', { categoria: nomeCategoria, medicamentos });
});

// Busca de medicamentos 
app.get('/resultado-busca', async (req, res) => {
  const termo = req.query.termo || '';
  if (!termo) return res.render('resultado-busca', { medicamentos: [], termo });

  try {
    const regex = new RegExp(termo, 'i');
    const medicamentos = await medicamentosCollection.find({ nome: regex }).toArray();
    res.render('resultado-busca', { medicamentos, termo });
  } catch (err) {
    console.error('Erro na busca:', err);
    res.status(500).send('Erro ao buscar medicamentos');
  }
});

// Iniciar servidor após conectar no Mongo
connectDB().then(() => {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
});
