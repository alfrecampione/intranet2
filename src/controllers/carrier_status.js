import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";

const renderCarrierStatus = async (req, res) => {
    const userId = req.params.id

    const carriers = await prisma.statesANDCarriers.findMany({
        where: { userId },
        orderBy: { state: 'asc' },
    });

    res.render("carrier_status", { carriers, userId, user: req.user, activePage: 'config' });
};

const updateCarrierStatus = async (req, res) => {
    const { updates, userId } = req.body;

    if (!updates || !userId) {
        return res.status(400).json({ success: false, message: "Invalid request data" });
    }

    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
        try {
            for (const update of updates) {
                const { company, state, status } = update;

                await prisma.statesANDCarriers.updateMany({
                    where: {
                        userId,
                        company,
                        state,
                    },
                    data: { status },
                });
            }

            res.status(200).json({ success: true, message: "Carrier statuses updated successfully" });
        } catch (error) {
            console.error("Error updating carrier statuses:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    });
};

export { renderCarrierStatus, updateCarrierStatus };