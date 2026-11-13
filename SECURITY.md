# Security

*[Português abaixo](#segurança-resumo-em-português)*

Cesta stores a family's shopping lists, prices, budgets and receipts. The design goal: **the data lives on the family's
phones; the optional server only stores what it cannot read the password for, and personal identifiers are never kept.**

## Threat model

| Threat | Mitigation |
|---|---|
| Someone reaches the sync endpoint | Every request needs the family token. The password never leaves the phone: the app sends `SHA-256(password)` and the server stores only a hash of that token. The first phone creates the password; there is no account system to attack. |
| Server or host breach | Without sync, nothing is on a server at all. With sync, the Durable Object holds the shopping records and a hash of the token — no names, tax IDs or payment data. |
| Personal data on receipts | The receipt reader keeps store, items, prices and the access key; the buyer's tax ID, name and membership numbers are discarded on parsing and never stored. Test fixtures are anonymised. |
| Phishing through "receipt links" | Only `https://` links on `*.gov.br` with a valid receipt access key are opened; anything else is refused. |
| Scraping a protected public service | The app never fetches the tax authority's page automatically (it is protected against bots); the user copies the page text. |
| Other apps of the suite | The nutrition app is reached only through a private service binding; Cesta receives `{category, name, quantity, unit}` and sends back `{name, unit, price}` — nothing else. |

## Reporting

Please open a private security advisory on GitHub or contact the author through [github.com/BeBernos](https://github.com/BeBernos).

---

## Segurança (resumo em português)

A Cesta guarda listas, preços, orçamento e notas de uma família. O objetivo: **os dados vivem nos celulares da família; o
servidor opcional não tem a senha, e dados pessoais nunca são guardados.**

- **Endpoint de sincronização:** exige o token da família; a senha nunca sai do celular (vai `SHA-256(senha)`) e o servidor
  guarda só um hash do token.
- **Servidor invadido:** sem sincronização, não há nada em servidor; com ela, só os registros de compra e o hash do token.
- **Dados pessoais da nota:** CPF, nome e número de sócio são descartados na leitura e nunca guardados.
- **Links falsos:** só `https://` em `*.gov.br` com chave de acesso válida.
- **Robô na Sefaz:** nunca; o usuário copia o texto da página.
- **Apps do conjunto:** só por ligação privada entre Workers; a Cesta recebe a lista de compras da dieta e devolve preços.
