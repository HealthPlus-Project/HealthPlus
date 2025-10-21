const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = (usuariosCollection) => {
  router.get('/', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    try {
      const userId = new ObjectId(req.session.usuario._id);
      const usuario = await usuariosCollection.findOne({ _id: userId });

      const carrinho = usuario.carrinho || [];
      const total = carrinho.reduce((acc, item) => acc + item.preco * item.quantidade, 0);

      const pedido = { itens: carrinho, total };

      await usuariosCollection.updateOne(
        { _id: userId },
        { $set: { carrinho: [] } }
      );

      req.session.usuario.carrinho = [];

      res.render('finalizado', { pedido });
    } catch (err) {
      console.error('Erro ao finalizar compra:', err);
      res.status(500).send('Erro ao finalizar compra');
    }
  });

  return router;
};