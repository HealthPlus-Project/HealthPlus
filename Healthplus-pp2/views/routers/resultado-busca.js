app.get('/resultado-busca', async (req, res) => {
  const termo = req.query.termo || '';
  if (!termo) return res.render('resultado-busca', { medicamentos: [], termo });

  try {
    const regex = new RegExp(termo, 'i'); // busca case-insensitive no nome
    const medicamentos = await medicamentosCollection.find({ nome: regex }).toArray();
    console.log(`Busca por: ${termo} — achou ${medicamentos.length} resultados`); // debug

    res.render('resultado-busca', { medicamentos, termo });
  } catch (err) {
    console.error('Erro na busca:', err);
    res.status(500).send('Erro ao buscar medicamentos');
  }
});
