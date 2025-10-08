const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		password: {
			type: String,
			required: true,
		},
		fullname: {
			type: String,
			required: true,
			trim: true,
		},
		isSuperAdmin: {
			type: Boolean,
			default: false,
		},
		lastLoggedin: {
			type: Date,
		},
		phone: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
	}
);

// Add an index for email to enforce uniqueness at the DB level
AdminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Admin', AdminSchema);
