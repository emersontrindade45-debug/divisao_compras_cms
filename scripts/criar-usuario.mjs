// Cria (ou atualiza) um login da plataforma.
//
// Uso:
//   node scripts/criar-usuario.mjs "<nome>" <email> <senha> [pesquisa|revisao|aprovacao]
//
// Usa o DATABASE_URL do .env — confira se aponta para o banco desejado
// (local ou produção) antes de rodar. Se o e-mail já existir, atualiza
// nome, senha e papel (útil para redefinir senha).
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const PAPEIS = ["pesquisa", "revisao", "aprovacao"];
const [nome, emailBruto, senha, papel = "pesquisa"] = process.argv.slice(2);

if (!nome || !emailBruto || !senha) {
  console.error(
    'Uso: node scripts/criar-usuario.mjs "<nome>" <email> <senha> [pesquisa|revisao|aprovacao]',
  );
  process.exit(1);
}
if (!PAPEIS.includes(papel)) {
  console.error(`Papel inválido "${papel}". Use: ${PAPEIS.join(", ")}`);
  process.exit(1);
}
if (senha.length < 8) {
  console.error("A senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurado");
}

const email = emailBruto.trim().toLowerCase();
const passwordHash = bcrypt.hashSync(senha, 10);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: nome, passwordHash, role: papel },
    update: { name: nome, passwordHash, role: papel },
    select: { email: true, name: true, role: true },
  });
  console.log(`Login pronto: ${user.name} <${user.email}> (${user.role})`);
} finally {
  await prisma.$disconnect();
}
