"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
class BaseRepository {
    model;
    constructor(model) {
        this.model = model;
    }
    async findById(id) {
        try {
            return await this.model.findById(id).exec();
        }
        catch (err) {
            throw this.wrap("findById", err);
        }
    }
    async findOne(filter) {
        try {
            return await this.model.findOne(filter).exec();
        }
        catch (err) {
            throw this.wrap("findOne", err);
        }
    }
    async findMany(filter = {}, limit) {
        try {
            const query = this.model.find(filter);
            if (limit !== undefined)
                query.limit(limit);
            return await query.exec();
        }
        catch (err) {
            throw this.wrap("findMany", err);
        }
    }
    async create(data) {
        try {
            const doc = new this.model(data);
            return (await doc.save());
        }
        catch (err) {
            throw this.wrap("create", err);
        }
    }
    async updateById(id, data) {
        try {
            return await this.model
                .findByIdAndUpdate(id, { $set: data }, {
                returnDocument: "after",
                runValidators: true,
            })
                .exec();
        }
        catch (err) {
            throw this.wrap("updateById", err);
        }
    }
    async deleteById(id) {
        try {
            const result = await this.model.findByIdAndDelete(id).exec();
            return result !== null;
        }
        catch (err) {
            throw this.wrap("deleteById", err);
        }
    }
    async exists(filter) {
        try {
            const result = await this.model.exists(filter).exec();
            return result !== null;
        }
        catch (err) {
            throw this.wrap("exists", err);
        }
    }
    async count(filter = {}) {
        try {
            return await this.model.countDocuments(filter).exec();
        }
        catch (err) {
            throw this.wrap("count", err);
        }
    }
    wrap(method, err) {
        const name = this.model.modelName;
        const msg = err instanceof Error ? err.message : String(err);
        return new Error(`[${name}Repository.${method}] ${msg}`);
    }
}
exports.BaseRepository = BaseRepository;
