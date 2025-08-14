import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";

const renderLeadCenter = async (req, res) => {
    try {
        const leadCenter = await prisma.lead.findMany({
            include: { Company: true },
            orderBy: { fullName: "desc" },
        });

        res.render("lead_center", {
            user: req.user,
            leadCenter,
            activePage: "lead-center",
        });
    } catch (error) {
        console.error("Error fetching lead centers:", error);
        res.status(500).send("Internal Server Error");
    }
};

const acceptAsAgent = async (req, res) => {
    const { email } = req.params;
    try {
        const lead = await prisma.lead.findUnique({
            where: { email: email },
        });

        if (!lead) {
            return res.status(404).json({ error: "Lead not found" });
        }

        await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
            try {
                await prisma.lead.update({
                    where: { id: id },
                    data: { isAcepted: true },
                });
            } catch (err) {
                console.error("Error updating lead to accepted:", err);
                throw err;
            }
        });

    }
    catch (error) {
        console.error("Error accepting lead as agent:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const deleteLead = async (req, res) => {
    const { id } = req.params;
    try {
        const lead = await prisma.lead.delete({
            where: { id: id },
        });
        res.status(200).json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        console.error("Error deleting lead:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export { renderLeadCenter, deleteLead, acceptAsAgent };