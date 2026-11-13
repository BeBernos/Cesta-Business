# Estudo de caso — Cesta

*[Read in English](case-study.md)*

**Papel:** produto, UX e engenharia, de ponta a ponta · **Período:** out/2026 – hoje, 14 versões · **Usuários:** quem faz as
compras da família, todo mês (dois celulares sincronizados)

## O problema

A família pesquisava preços de mercado em cinco lojas todo mês numa planilha do Excel: uma aba por mês, três colunas por
mercado (preço, total, marca), fórmulas para o mais barato e o total do mês. Funcionava na mesa e em nenhum outro lugar —
nem no corredor do mercado, nem no celular, nem com duas pessoas dividindo a lista. A nota nunca era conferida contra o
plano, e o histórico de preços morava em abas antigas que ninguém reabria.

## Objetivos

- Pesquisar e comprar pelo celular, offline, com uma mão.
- Manter todos os números da planilha — no centavo — e o formato dela, para nada se perder na mudança.
- Transformar a nota em informação: o que foi cobrado acima da gôndola ou do previsto.
- Sem custo, sem cadastro, sem dependência para manter.

## Decisões principais

| Decisão | Por quê | Custo |
|---|---|---|
| **Registros locais `{k, u, v}` com sincronização opcional** | Funciona em qualquer mercado sem sinal; sincronizar é conveniência, não requisito | "Vence o carimbo maior" por chave e lápides; mudar o formato das chaves exige migração |
| **Ler e gerar o `.xlsx` original** | A família mantém a planilha como cópia e ponte | Uma camada ZIP/XML escrita à mão em vez de biblioteca, protegida por testes contra o arquivo real |
| **Ler a nota a partir do texto que o usuário copia** | A página da Sefaz bloqueia acesso automático; robô seria frágil e indelicado | Um passo a mais (copiar a página) — ou uma foto colada no Claude com um pedido pronto |
| **Regras e memória em vez de API de IA** | Sugerir categoria e ligar a nota precisam ser instantâneos, offline e grátis | Regras conservadoras: na dúvida (empate), o app pergunta |
| **Durable Object para sincronizar** | Um SQLite pequeno por família no plano grátis, consistência forte, nenhum banco para manter | O build de branch não sobe migração de Durable Object → só a `main` publica |

## O que saiu

- A pesquisa do mês acontece no corredor, com o mercado mais barato e a rota sempre à vista.
- A nota é conferida em um minuto; os códigos de cada loja são aprendidos e a próxima nota se liga sozinha.
- O total do mês bate com a planilha antiga, e a planilha ainda pode ser exportada a qualquer hora.
- Uma ponte na casa: a Cesta traz a lista de compras da dieta do app de alimentação (Mesa) e devolve o preço por grama, e o
  custo da semana da dieta aparece lá.

## O que eu faria a seguir

Histórico de preços entre famílias (opcional e anônimo) para um índice do bairro, e uma versão white-label para
cooperativas de compra.
