import { prisma } from "../config/dbConfig.js";

const renderCarrierStatus = async (req, res) => {
    const userId = req.params.id

    const carriers = await prisma.statesANDCarriers.findMany({
        where: { userId },
        orderBy: { state: 'asc' },
    });

    res.render("carrier_status", { carriers, userId, user: req.user });
};

export { renderCarrierStatus };