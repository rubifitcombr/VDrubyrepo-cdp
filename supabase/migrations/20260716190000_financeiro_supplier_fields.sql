-- Campos extras no cadastro de fornecedores (financeiro do caixa).

alter table public.suppliers
  add column if not exists cnpj text,
  add column if not exists observacao text;

comment on column public.suppliers.cnpj is 'CNPJ/CPF do fornecedor (texto livre, só dígitos ou formatado).';
comment on column public.suppliers.observacao is 'Observações internas do lojista sobre o fornecedor.';

select pg_notify('pgrst', 'reload schema');
