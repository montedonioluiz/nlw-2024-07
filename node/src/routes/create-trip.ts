import "dayjs/locale/pt-br";

import z from "zod";
import dayjs from "dayjs";
import nodemailer from "nodemailer";
import { FastifyInstance } from "fastify";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";

dayjs.locale("pt-br");
dayjs.extend(localizedFormat);

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips",
    {
      schema: {
        body: z.object({
          destination: z.string().min(4),
          starts_at: z.coerce.date(),
          ends_at: z.coerce.date(),
          owner: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
          emails_to_invite: z.array(z.string().email()),
        }),
      },
    },
    async (request) => {
      const { destination, starts_at, ends_at, owner, emails_to_invite } =
        request.body;

      if (dayjs(starts_at).isBefore(new Date())) {
        throw new Error("Start must be before today.");
      }
      if (dayjs(ends_at).isBefore(starts_at)) {
        throw new Error("End must be after start.");
      }

      const trip = await prisma.trip.create({
        data: {
          destination,
          starts_at,
          ends_at,
          participants: {
            createMany: {
              data: [
                {
                  name: owner.name,
                  email: owner.email,
                  is_owner: true,
                  is_confirmed: true,
                },
                ...emails_to_invite.map((email) => ({ email })),
              ],
            },
          },
        },
      });

      const formattedTripStartDate = dayjs(starts_at).format("LL");
      const formattedTripEndDate = dayjs(starts_at).format("LL");

      const confirmationLink = `http://localhost:3333/trips/${trip.id}/confirm`;

      const mail = await getMailClient();
      const message = await mail.sendMail({
        from: {
          name: "Equipe Planner",
          address: "oi@planner.er",
        },
        to: {
          name: owner.name,
          address: owner.email,
        },
        subject: `Confirme sua viagem para ${destination} em ${formattedTripStartDate}`,
        html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
            <p style="margin-bottom: 16px">Você solicitou a criação de uma viagem para <strong>${destination}</strong> nas datas de <strong>${formattedTripStartDate}</strong> até <strong>${formattedTripEndDate}</strong>.</p>
            
            <p style="margin-bottom: 16px">Para confirmar sua viagem, clique no link abaixo:</p>
            
            <p style="margin-bottom: 16px">
                <a href="${confirmationLink}">Confirmar viagem</a>
            </p>
            <p>Caso você não saiba do que se trata esse e-mail, apenas ignore esse e-mail.</p>
        </div>
        `.trim(),
      });
      console.log(nodemailer.getTestMessageUrl(message));

      return { id: trip.id };
    }
  );
}
