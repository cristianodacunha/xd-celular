/* Pacotes ZIP sem compressao: reduz milhares de requisicoes a poucos downloads. */
(function () {
  function mime(name) {
    if (/\.webp$/i.test(name)) return 'image/webp';
    if (/\.json$/i.test(name)) return 'application/json';
    if (/\.js$/i.test(name)) return 'text/javascript';
    if (/\.otf$/i.test(name)) return 'font/otf';
    return 'application/octet-stream';
  }
  function entries(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw Error('Pacote ZIP invalido');
    var count = view.getUint16(end + 10, true), pos = view.getUint32(end + 16, true), decoder = new TextDecoder(), files = [];
    for (var n = 0; n < count; n++) {
      if (view.getUint32(pos, true) !== 0x02014b50) throw Error('Indice ZIP invalido');
      var method = view.getUint16(pos + 10, true), size = view.getUint32(pos + 24, true), nameLen = view.getUint16(pos + 28, true), extraLen = view.getUint16(pos + 30, true), commentLen = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true), name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      if (method !== 0 || view.getUint32(local, true) !== 0x04034b50) throw Error('Formato ZIP nao suportado');
      var dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      files.push({ name: name, data: bytes.slice(dataStart, dataStart + size) });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }
  function workers() {
    var c = navigator.connection || {}, slow = c.saveData || /2g|3g/.test(c.effectiveType || '');
    return slow ? 1 : 3;
  }
  var button = document.querySelector('#startDownload');
  var previousDownload = button && button.onclick;
  async function packedDownload() {
    await pedirPermanente();
    var manifest = await getManifest();
    if (!manifest.bundles || !manifest.bundles.length) return previousDownload.call(button);
    var cache = await cacheCat(), button = $('#startDownload'), byName = {};
    manifest.assets.forEach(function (asset) { byName[asset.file] = asset; });
    var bytes = 0, done = 0, failed = null, cursor = 0;
    button.disabled = true;
    $('#downloadState').textContent = 'Baixando pacotes rapidos (' + workers() + ' conexoes). Mantenha o aplicativo aberto.';
    function update() {
      var pct = Math.min(99, Math.round(bytes / manifest.totalBytes * 100));
      $('#progress').style.width = pct + '%';
      $('#percent').textContent = pct + '% · ' + fmt(bytes) + ' de ' + fmt(manifest.totalBytes) + ' · ' + done.toLocaleString('pt-BR') + ' arquivos';
    }
    async function worker() {
      while (cursor < manifest.bundles.length && !failed) {
        var bundle = manifest.bundles[cursor++];
        try {
          var response = await fetch(bundle.file, { cache: 'no-store' });
          if (!response.ok) throw Error(String(response.status));
          var files = entries(new Uint8Array(await response.arrayBuffer()));
          for (var i = 0; i < files.length; i++) {
            var file = files[i], asset = byName[file.name];
            if (!asset) throw Error('Arquivo inesperado no pacote');
            if (!(await cache.match(file.name))) await cache.put(file.name, new Response(file.data, { headers: { 'Content-Type': mime(file.name) } }));
            bytes += asset.bytes; done++;
            if (done % 24 === 0) update();
          }
          update();
        } catch (error) { failed = error; }
      }
    }
    await Promise.all(Array.from({ length: workers() }, worker));
    if (failed || done !== manifest.assets.length) {
      button.disabled = false;
      $('#downloadState').textContent = 'Download pausado. Toque novamente para continuar.';
      toast('A conexao foi interrompida. O progresso foi salvo.');
      return;
    }
    await cache.put(COMPLETE, new Response(JSON.stringify({ version: manifest.version || '', completedAt: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } }));
    localStorage.setItem('xd-data-version', manifest.version || '');
    $('#progress').style.width = '100%'; $('#percent').textContent = '100% concluido';
    $('#downloadState').textContent = 'Catalogo pronto para uso sem internet.';
    setDownloadButton(true, false); showUpdate(false); renderPermanente(); toast('Catalogo baixado com sucesso'); await loadData();
  }
  if (button) button.onclick = packedDownload;
}());
