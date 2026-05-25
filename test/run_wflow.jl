
        using Wflow
        println("Starting Wflow...")
        flush(stdout)
        path = "model/wflow_sbm.toml"
        # config = Wflow.Config(path)
        try
            # model = Wflow.Model(config)
            # Wflow.initialize!(model)
            # for (i, t) in enumerate(Wflow.timesteps(model))
            #     println("Step: ", i, " Time: ", t)
            #     flush(stdout)
            #     Wflow.update!(model)
            # end
            # Wflow.finalize!(model)
            Wflow.run(path)
            println("Finished successfully!")
        catch e
            println("ERROR:")
            println(e)
        end
        flush(stdout)
    