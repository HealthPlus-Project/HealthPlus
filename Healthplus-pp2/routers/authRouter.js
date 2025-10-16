const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Rota para mostrar o formulário de criação de conta
router.get('/criar-conta', (req, res) => {
  res.render('criar_conta');
});

// Rota para processar o formulário
router.post('/criar-conta', (req, res) => {
  const { nome, email, senha } = req.body;

  db.run(`INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)`,
    [nome, email, senha],
    function (err) {
      if (err) {
        return res.status(500).send("Erro ao criar conta.");
      }
      req.session.usuario = { id: this.lastID, nome, email };
      res.redirect('/');
    });
});

module.exports = router;
