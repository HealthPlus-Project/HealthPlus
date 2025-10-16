const express = require('express');
const router = express.Router();
const connect = require('../db');

router.get('/', async (req, res) => {
  const db = await connect();
  if (!db) return res.status(500).send('Erro de conexão com o banco de dados.');

  try {
    const medicamentos = await db.collection('medicamentos').find().toArray();
    res.render('medicamentos', { medicamentos });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao buscar medicamentos.');
  }
});

module.exports = router;
